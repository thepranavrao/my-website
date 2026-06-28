"""
POSH Compass — FastAPI backend (vertical slice).

Run from the project root:
    backend/.venv/Scripts/python -m uvicorn backend.app:app --reload --port 8000
Then open http://localhost:8000

Serves the existing static frontend AND a JSON API under /api:
  auth (JWT) · attempts · server-side grading · certificates · live dashboard.
Storage: SQLite (poshcompass.db). Swap the engine URL for Postgres in prod.
"""

import os, json, hmac, hashlib, base64, time, secrets, datetime as dt
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import (create_engine, String, Integer, Boolean, Float, Text,
                        ForeignKey, DateTime, func, select)
from sqlalchemy.orm import (DeclarativeBase, Mapped, mapped_column, relationship,
                            sessionmaker, Session)

from .questions_seed import MODULES, MODULE_ORDER, BANK
from .scoring import grade

# --------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent           # the Compass/ folder
DB_PATH = Path(__file__).resolve().parent / "poshcompass.db"
SECRET = os.environ.get("POSH_SECRET", "dev-secret-change-me")
PASS_MARK = 80                                           # individual certificate threshold

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False)


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


# --------------------------------------------------------------------------
# Models
# --------------------------------------------------------------------------
class Base(DeclarativeBase):
    pass


class Organisation(Base):
    __tablename__ = "organisations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    plan_tier: Mapped[str] = mapped_column(String(40), default="1-30")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
    users = relationship("User", back_populates="org")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organisations.id"))
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="learner")   # admin | learner
    department: Mapped[str] = mapped_column(String(80), default="General")
    baseline_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # pre-training
    org = relationship("Organisation", back_populates="users")


class Question(Base):
    __tablename__ = "questions"
    id: Mapped[int] = mapped_column(primary_key=True)
    mod_id: Mapped[str] = mapped_column(String(40))
    mod_no: Mapped[int] = mapped_column(Integer)
    mod_title: Mapped[str] = mapped_column(String(80))
    mod_sub: Mapped[str] = mapped_column(String(160))
    qtype: Mapped[str] = mapped_column(String(40))
    order_idx: Mapped[int] = mapped_column(Integer)
    payload: Mapped[str] = mapped_column(Text)   # JSON (no answers)
    answer: Mapped[str] = mapped_column(Text)    # JSON (answers + reveal)


class Attempt(Base):
    __tablename__ = "attempts"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    score: Mapped[float] = mapped_column(Float, default=0.0)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)


class Answer(Base):
    __tablename__ = "answers"
    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey("attempts.id"))
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"))
    given: Mapped[str] = mapped_column(Text)
    earned: Mapped[float] = mapped_column(Float)
    max: Mapped[float] = mapped_column(Float)
    correct: Mapped[bool] = mapped_column(Boolean)


class Certificate(Base):
    __tablename__ = "certificates"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    attempt_id: Mapped[int] = mapped_column(ForeignKey("attempts.id"))
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    score: Mapped[float] = mapped_column(Float)
    issued_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(nullable=True)
    action: Mapped[str] = mapped_column(String(60))
    entity: Mapped[str] = mapped_column(String(60))
    meta: Mapped[str] = mapped_column(Text, default="{}")
    ts: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


# --------------------------------------------------------------------------
# Security helpers (stdlib only — no native deps)
# --------------------------------------------------------------------------
def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def hash_pw(pw: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200_000)
    return f"{salt.hex()}${dk.hex()}"


def verify_pw(pw: str, stored: str) -> bool:
    try:
        salt_hex, dk_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt_hex), 200_000)
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


def make_token(uid: int, ttl: int = 86_400 * 7) -> str:
    head = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = _b64(json.dumps({"sub": uid, "exp": int(time.time()) + ttl}).encode())
    seg = f"{head}.{body}"
    sig = _b64(hmac.new(SECRET.encode(), seg.encode(), hashlib.sha256).digest())
    return f"{seg}.{sig}"


def read_token(token: str):
    try:
        head, body, sig = token.split(".")
        expect = _b64(hmac.new(SECRET.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expect, sig):
            return None
        payload = json.loads(_b64d(body))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


# --------------------------------------------------------------------------
# DB session + current-user dependencies
# --------------------------------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Not authenticated")
    payload = read_token(authorization.split(" ", 1)[1])
    if not payload:
        raise HTTPException(401, "Invalid or expired token")
    user = db.get(User, payload["sub"])
    if not user:
        raise HTTPException(401, "User not found")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    return user


def log(db, actor_id, action, entity, **meta):
    db.add(AuditLog(actor_id=actor_id, action=action, entity=entity, meta=json.dumps(meta)))


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------
class RegisterIn(BaseModel):
    orgName: str
    name: str
    email: str
    password: str
    department: str = "HR"


class LoginIn(BaseModel):
    email: str
    password: str


class AnswerIn(BaseModel):
    questionId: int
    given: dict


# --------------------------------------------------------------------------
# App
# --------------------------------------------------------------------------
app = FastAPI(title="POSH Compass API")


@app.get("/api/health")
def health():
    return {"ok": True, "service": "posh-compass", "passMark": PASS_MARK}


# ---- auth ----
@app.post("/api/auth/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "An account with that email already exists")
    org = Organisation(name=body.orgName)
    db.add(org); db.flush()
    user = User(org_id=org.id, name=body.name, email=body.email.lower(),
                password_hash=hash_pw(body.password), role="admin", department=body.department)
    db.add(user); db.flush()
    log(db, user.id, "register_org", "organisation", org=body.orgName)
    db.commit()
    return {"token": make_token(user.id), "role": user.role, "name": user.name}


@app.post("/api/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_pw(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    log(db, user.id, "login", "user"); db.commit()
    return {"token": make_token(user.id), "role": user.role, "name": user.name}


@app.get("/api/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    org = db.get(Organisation, user.org_id)
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role,
            "department": user.department, "org": org.name if org else "—"}


# ---- assessment lifecycle ----
def _ordered_questions(db: Session):
    qs = db.scalars(select(Question)).all()
    order = {m: i for i, m in enumerate(MODULE_ORDER)}
    return sorted(qs, key=lambda q: (order.get(q.mod_id, 99), q.order_idx))


@app.post("/api/attempts")
def start_attempt(user: User = Depends(current_user), db: Session = Depends(get_db)):
    attempt = Attempt(user_id=user.id)
    db.add(attempt); db.flush()
    log(db, user.id, "attempt_started", "attempt", attempt_id=attempt.id)
    db.commit()
    items = []
    for q in _ordered_questions(db):
        items.append({
            "qid": q.id, "type": q.qtype, "modId": q.mod_id, "modNo": q.mod_no,
            "modTitle": q.mod_title, "modSub": q.mod_sub,
            "q": json.loads(q.payload),
        })
    return {"attemptId": attempt.id, "items": items}


@app.post("/api/attempts/{attempt_id}/answer")
def submit_answer(attempt_id: int, body: AnswerIn,
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    attempt = db.get(Attempt, attempt_id)
    if not attempt or attempt.user_id != user.id:
        raise HTTPException(404, "Attempt not found")
    if attempt.finished_at:
        raise HTTPException(409, "Attempt already finished")
    q = db.get(Question, body.questionId)
    if not q:
        raise HTTPException(404, "Question not found")

    earned, mx, reveal = grade(q.qtype, json.loads(q.answer), body.given)
    # upsert: one answer row per (attempt, question)
    existing = db.scalar(select(Answer).where(Answer.attempt_id == attempt_id,
                                              Answer.question_id == q.id))
    if existing:
        existing.given = json.dumps(body.given); existing.earned = earned
        existing.max = mx; existing.correct = earned == mx
    else:
        db.add(Answer(attempt_id=attempt_id, question_id=q.id, given=json.dumps(body.given),
                      earned=earned, max=mx, correct=earned == mx))
    log(db, user.id, "answer_submitted", "question", attempt_id=attempt_id,
        question_id=q.id, earned=earned, max=mx)
    db.commit()
    return {"earned": earned, "max": mx, "reveal": reveal}


@app.post("/api/attempts/{attempt_id}/finish")
def finish_attempt(attempt_id: int,
                   user: User = Depends(current_user), db: Session = Depends(get_db)):
    attempt = db.get(Attempt, attempt_id)
    if not attempt or attempt.user_id != user.id:
        raise HTTPException(404, "Attempt not found")

    rows = db.scalars(select(Answer).where(Answer.attempt_id == attempt_id)).all()
    earned = sum(r.earned for r in rows)
    mx = sum(r.max for r in rows)
    pct = round(earned / mx * 100) if mx else 0
    attempt.score = pct
    attempt.passed = pct >= PASS_MARK
    attempt.finished_at = utcnow()

    # per-module breakdown
    qmap = {q.id: q for q in db.scalars(select(Question)).all()}
    agg = {}
    for r in rows:
        q = qmap.get(r.question_id)
        if not q:
            continue
        a = agg.setdefault(q.mod_id, {"title": q.mod_title, "e": 0, "m": 0})
        a["e"] += r.earned; a["m"] += r.max
    by_module = [{"title": agg[m]["title"],
                  "pct": round(agg[m]["e"] / agg[m]["m"] * 100) if agg[m]["m"] else 0}
                 for m in MODULE_ORDER if m in agg]

    cert_code = None
    if attempt.passed:
        cert_code = "PC-2026-" + str(secrets.randbelow(9000) + 1000)
        db.add(Certificate(user_id=user.id, attempt_id=attempt.id, code=cert_code, score=pct))
        log(db, user.id, "certificate_issued", "certificate", code=cert_code, score=pct)
    log(db, user.id, "attempt_finished", "attempt", attempt_id=attempt.id, score=pct, passed=attempt.passed)
    db.commit()
    return {"score": pct, "passed": attempt.passed, "points": earned, "max": mx,
            "questions": len(rows), "certCode": cert_code, "byModule": by_module,
            "learner": {"name": user.name, "org": db.get(Organisation, user.org_id).name,
                        "department": user.department}}


@app.get("/api/verify/{code}")
def verify_certificate(code: str, db: Session = Depends(get_db)):
    cert = db.scalar(select(Certificate).where(Certificate.code == code))
    if not cert:
        raise HTTPException(404, "Certificate not found")
    u = db.get(User, cert.user_id)
    org = db.get(Organisation, u.org_id) if u else None
    return {"valid": True, "code": cert.code, "name": u.name if u else "—",
            "org": org.name if org else "—", "score": cert.score,
            "issued": cert.issued_at.date().isoformat()}


# ---- admin dashboard ----
@app.get("/api/admin/stats")
def admin_stats(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    org_id = user.org_id
    user_ids = [u.id for u in db.scalars(select(User).where(User.org_id == org_id)).all()]
    users = db.scalars(select(User).where(User.org_id == org_id)).all()
    enrolled = len(users)

    finished = db.scalars(select(Attempt).where(Attempt.user_id.in_(user_ids),
                                                Attempt.finished_at.isnot(None))).all()
    # best finished attempt per user
    best = {}
    for a in finished:
        if a.user_id not in best or a.score > best[a.user_id].score:
            best[a.user_id] = a
    completed = len(best)
    avg_score = round(sum(a.score for a in best.values()) / completed) if completed else 0
    certified = sum(1 for a in best.values() if a.passed)

    # completion / score by department (avg best score)
    dept = {}
    for u in users:
        d = dept.setdefault(u.department, {"users": 0, "scoreSum": 0, "done": 0})
        d["users"] += 1
        if u.id in best:
            d["scoreSum"] += best[u.id].score
            d["done"] += 1
    by_dept = [{"name": k,
                "completion": round(v["done"] / v["users"] * 100) if v["users"] else 0,
                "avg": round(v["scoreSum"] / v["done"]) if v["done"] else 0}
               for k, v in sorted(dept.items())]

    # pre vs post (baseline vs best)
    pre_vals = [u.baseline_score for u in users if u.baseline_score is not None and u.id in best]
    post_vals = [best[u.id].score for u in users if u.baseline_score is not None and u.id in best]
    pre = round(sum(pre_vals) / len(pre_vals)) if pre_vals else 0
    post = round(sum(post_vals) / len(post_vals)) if post_vals else avg_score

    org_compliance = round(certified / enrolled * 100) if enrolled else 0

    recent = db.scalars(
        select(AuditLog).where(AuditLog.actor_id.in_(user_ids),
                               AuditLog.action.in_(["attempt_finished", "certificate_issued"]))
        .order_by(AuditLog.ts.desc()).limit(6)).all()
    umap = {u.id: u for u in users}
    feed = []
    for r in recent:
        m = json.loads(r.meta)
        who = umap.get(r.actor_id)
        feed.append({"user": who.name if who else "—",
                     "action": "Assessment completed" if r.action == "attempt_finished" else "Certificate issued",
                     "score": m.get("score", m.get("score", "")),
                     "ts": r.ts.strftime("%d %b, %H:%M")})

    org = db.get(Organisation, org_id)
    return {"org": org.name if org else "—", "enrolled": enrolled,
            "completion": round(completed / enrolled * 100) if enrolled else 0,
            "avgScore": avg_score, "certified": certified, "orgCompliance": org_compliance,
            "byDept": by_dept, "preAvg": pre, "postAvg": post,
            "improvement": max(post - pre, 0), "feed": feed}


# --------------------------------------------------------------------------
# Seed + static mount
# --------------------------------------------------------------------------
def seed():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        if db.scalar(select(func.count(Question.id))) == 0:
            for mod in MODULES:
                for i, item in enumerate(BANK[mod["id"]]):
                    db.add(Question(mod_id=mod["id"], mod_no=mod["no"], mod_title=mod["title"],
                                    mod_sub=mod["sub"], qtype=mod["id"], order_idx=i,
                                    payload=json.dumps(item["payload"]), answer=json.dumps(item["answer"])))
            db.commit()

        if db.scalar(select(func.count(Organisation.id))) == 0:
            _seed_demo_org(db)
    finally:
        db.close()


def _seed_demo_org(db: Session):
    """A pre-populated org so the dashboard shows real numbers on first load.
    Demo admin login -> admin@demo.gov / demo1234"""
    org = Organisation(name="Department of Public Administration", plan_tier="201+")
    db.add(org); db.flush()
    admin = User(org_id=org.id, name="Priya Sharma", email="admin@demo.gov",
                 password_hash=hash_pw("demo1234"), role="admin", department="HR Office",
                 baseline_score=58)
    db.add(admin); db.flush()

    demo = [
        ("Rohit Kumar", "Revenue", 55, 96, True),
        ("Ananya Singh", "Police", 60, 91, True),
        ("Meena Pillai", "Health", 50, 88, True),
        ("Suresh V.", "Education", 48, 80, True),
        ("Kavita Rao", "PWD", 52, 72, False),
        ("Imran Khan", "Transport", 45, 64, False),
        ("Neha Gupta", "Revenue", 57, 92, True),
        ("Arjun Mehta", "Police", 49, 84, True),
    ]
    qids_count = db.scalar(select(func.count(Question.id))) or 14
    for name, dept, pre, post, _passed in demo:
        u = User(org_id=org.id, name=name, email=name.lower().replace(" ", ".").replace(".", "") + "@demo.gov",
                 password_hash=hash_pw("demo1234"), role="learner", department=dept, baseline_score=pre)
        db.add(u); db.flush()
        att = Attempt(user_id=u.id, score=post, passed=post >= PASS_MARK,
                      finished_at=utcnow())
        db.add(att); db.flush()
        db.add(AuditLog(actor_id=u.id, action="attempt_finished", entity="attempt",
                        meta=json.dumps({"attempt_id": att.id, "score": post, "passed": post >= PASS_MARK}),
                        ts=utcnow()))
        if post >= PASS_MARK:
            code = "PC-2026-" + str(secrets.randbelow(9000) + 1000)
            db.add(Certificate(user_id=u.id, attempt_id=att.id, code=code, score=post))
    db.commit()


seed()

# Serve the existing frontend (index.html, assessment.html, dashboard.html, assets/)
app.mount("/", StaticFiles(directory=str(ROOT), html=True), name="static")


@app.exception_handler(404)
async def spa_404(_req, exc):
    return JSONResponse({"detail": "Not found"}, status_code=404)
