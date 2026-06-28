"""Server-side grading. Given a question's stored answer and the learner's
submission, returns (earned, max_points, reveal) where `reveal` is the answer
info the client may now show."""


def _norm(s):
    return " ".join(str(s or "").strip().lower().split())


def grade(qtype, answer, given):
    given = given or {}

    if qtype == "mcq":
        ok = given.get("index") == answer["index"]
        return (1 if ok else 0), 1, {"answer": answer["index"], "explain": answer["explain"]}

    if qtype == "fib":
        val = _norm(given.get("text"))
        ok = any(_norm(a) == val for a in answer["accept"]) and val != ""
        return (1 if ok else 0), 1, {"answer": answer["accept"], "explain": answer["explain"]}

    if qtype == "mtf":
        pairs = answer["pairs"]
        mp = given.get("map", {}) or {}
        earned = sum(1 for p in pairs if mp.get(p["left"]) == p["right"])
        return earned, len(pairs), {"pairs": pairs, "explain": answer["explain"]}

    if qtype == "caseStudy":
        subs = answer["subs"]
        picks = given.get("subs", []) or []
        earned = sum(1 for i, s in enumerate(subs)
                     if i < len(picks) and picks[i] == s["index"])
        return earned, len(subs), {"subs": subs, "explain": answer.get("explain", "")}

    if qtype == "simulation":
        opts = answer["options"]
        i = given.get("index")
        ok = isinstance(i, int) and 0 <= i < len(opts) and opts[i]["verdict"] in ("recommended", "also-correct")
        return (1 if ok else 0), 1, {"options": opts, "explain": answer["explain"]}

    return 0, 1, {}
