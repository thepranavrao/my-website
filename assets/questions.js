/* ===================================================================
   POSH Compass — DEMO question bank
   --------------------------------------------------------------------
   Full programme: 500 FIB · 300 MTF · 200 MCQ · 108 Case Studies ·
                   100 Live Simulations.
   This file ships a representative DEMO subset of each type. The schema
   is built to scale: add objects to any array and the engine renders
   them automatically.

   All content is aligned to the Sexual Harassment of Women at Workplace
   (Prevention, Prohibition and Redressal) Act, 2013.
   =================================================================== */

const QUESTION_BANK = {

  /* ---------------- MODULE 1 · MCQ (200 in full set) ---------------- */
  mcq: {
    id: "mcq",
    no: 1,
    title: "Multiple Choice",
    sub: "What legally counts — and the correct response",
    fullCount: 200,
    questions: [
      {
        text: "Under the POSH Act, 2013, an Internal Committee (IC) becomes a legal duty for every workplace with how many employees?",
        options: ["5 or more employees", "10 or more employees", "20 or more employees", "50 or more employees"],
        answer: 1,
        explain: "Section 4 requires every employer of a workplace with 10 or more workers to constitute an Internal Committee."
      },
      {
        text: "A complaint of workplace sexual harassment must ordinarily be filed within what period from the date of the incident?",
        options: ["30 days", "3 months", "6 months", "1 year"],
        answer: 1,
        explain: "Section 9 sets a limitation of 3 months from the incident, extendable by a further 3 months for good reason."
      },
      {
        text: "Which of the following is NOT, by itself, one of the five forms of sexual harassment listed in Section 2(n) / 3(2) of the Act?",
        options: ["Physical contact and advances", "A demand or request for sexual favours", "Constructive feedback on work performance", "Showing pornography"],
        answer: 2,
        explain: "Genuine, good-faith performance feedback is not harassment. The Act lists physical advances, demands for favours, sexually coloured remarks, showing pornography, and other unwelcome conduct."
      },
      {
        text: "The Internal Committee must be headed by a Presiding Officer who is:",
        options: ["Any senior male manager", "A woman employed at a senior level", "An external lawyer only", "The HR head by default"],
        answer: 1,
        explain: "Section 4(2): the Presiding Officer must be a woman employed at a senior level at the workplace."
      }
    ]
  },

  /* ---------------- MODULE 2 · FIB (500 in full set) ---------------- */
  fib: {
    id: "fib",
    no: 2,
    title: "Fill in the Blank",
    sub: "Recall the exact legal detail",
    fullCount: 500,
    questions: [
      {
        before: "The POSH Act came into force on 9 December",
        after: ", giving binding effect to the Vishaka Guidelines.",
        answer: ["2013"],
        explain: "The Act was passed in February 2013 and came into force on 9 December 2013."
      },
      {
        before: "At least one member of the Internal Committee must be an",
        after: "member from an NGO or association committed to the cause of women.",
        answer: ["external", "external"],
        explain: "Section 4(2)(c) requires one external member to ensure impartiality."
      },
      {
        before: "Not less than one-half (50%) of the Internal Committee members shall be",
        after: ".",
        answer: ["women", "woman"],
        explain: "Section 4(2): at least half of the IC members must be women."
      },
      {
        before: "The government's centralised online complaint portal for POSH is called",
        after: ".",
        answer: ["she-box", "shebox", "she box"],
        explain: "SHe-Box (Sexual Harassment electronic-Box) is the MWCD portal for filing and tracking POSH complaints."
      }
    ]
  },

  /* ---------------- MODULE 3 · MTF (300 in full set) ---------------- */
  mtf: {
    id: "mtf",
    no: 3,
    title: "Match the Following",
    sub: "Map provisions to where they apply",
    fullCount: 300,
    questions: [
      {
        instruction: "Match each element of the Act to its correct description.",
        pairs: [
          { left: "Section 4", right: "Constitution of the Internal Committee" },
          { left: "Section 9", right: "Filing a complaint (3-month limit)" },
          { left: "Presiding Officer", right: "Senior woman heading the IC" },
          { left: "SHe-Box", right: "Government online complaint portal" }
        ],
        explain: "Section 4 → IC constitution; Section 9 → complaint & timeline; Presiding Officer → senior woman; SHe-Box → online portal."
      },
      {
        instruction: "Match each role to its primary responsibility under the Act.",
        pairs: [
          { left: "Employer", right: "Provide a safe workplace & constitute IC" },
          { left: "Internal Committee", right: "Inquire into complaints fairly" },
          { left: "District Officer", right: "Constitute the Local Committee" },
          { left: "External Member", right: "Ensure impartiality in inquiry" }
        ],
        explain: "Employer → safe workplace/IC; IC → inquiry; District Officer → Local Committee; External member → impartiality."
      }
    ]
  },

  /* ---------------- MODULE 4 · CASE STUDIES (108 in full set) ------- */
  caseStudy: {
    id: "caseStudy",
    no: 4,
    title: "Case Studies",
    sub: "Real incidents, real judgement",
    fullCount: 108,
    questions: [
      {
        scenario: "Anita, a junior analyst, repeatedly receives late-night messages from her team lead asking her to 'grab a drink, just the two of us.' When she politely declines, her next performance review is unexpectedly poor. She is unsure whether this counts as harassment.",
        subs: [
          {
            text: "Does this situation fall within the definition of sexual harassment under the POSH Act?",
            options: ["No — it is only a personal matter", "Yes — unwelcome conduct linked to her employment", "Only if physical contact occurred", "Only if she had warned him in writing"],
            answer: 1,
            explain: "Unwelcome advances plus an implied threat to her employment (a worse review) is quid pro quo harassment under Section 3(2)."
          },
          {
            text: "What is the most appropriate first step for Anita?",
            options: ["Resign immediately", "Confront him publicly", "File a written complaint with the Internal Committee / SHe-Box", "Wait a year and see if it stops"],
            answer: 2,
            explain: "She should file a written complaint with the IC (or via SHe-Box) within 3 months; the IC is bound to inquire confidentially."
          }
        ]
      },
      {
        scenario: "During an office party, a senior colleague shows a group of juniors explicit images on his phone and laughs it off as 'just a joke.' One junior, Meera, feels deeply uncomfortable but worries that reporting it will brand her as 'difficult.'",
        subs: [
          {
            text: "Showing the explicit images in this context is:",
            options: ["Acceptable if outside office hours", "A form of sexual harassment (showing pornography)", "Only an HR etiquette issue, not POSH", "Not covered because it was a party"],
            answer: 1,
            explain: "Showing pornography is expressly listed in Section 3(2). The Act covers conduct at a workplace, which extends to office events."
          },
          {
            text: "Which protection does the Act give Meera if she reports?",
            options: ["None until the inquiry ends", "Protection against retaliation and confidentiality of identity", "A guaranteed promotion", "Anonymity from the IC itself"],
            answer: 1,
            explain: "The Act mandates confidentiality (Section 16) and protects complainants and witnesses from retaliation."
          }
        ]
      }
    ]
  },

  /* ---------------- MODULE 5 · LIVE SIMULATIONS (100 in full set) --- */
  simulation: {
    id: "simulation",
    no: 5,
    title: "Live Simulations",
    sub: "Branching scenarios — choices have consequences",
    fullCount: 100,
    questions: [
      {
        label: "Scenario 1 · Responding as a witness",
        branch: "Branch 1 of 3",
        scenario: "In the break room you overhear a senior colleague making repeated, unwelcome remarks about a teammate's body. The teammate looks uncomfortable but says nothing.",
        question: "What is the most appropriate action?",
        options: [
          { text: "Step in, name the behaviour as inappropriate, and support your colleague", verdict: "recommended", outcome: "You de-escalate safely and signal that the conduct is not acceptable — the strongest bystander response." },
          { text: "Say nothing now — it's not your business to intervene", verdict: "wrong", outcome: "Staying silent normalises the behaviour and leaves your colleague unsupported." },
          { text: "Record details and report to the Internal Committee (IC)", verdict: "also-correct", outcome: "Documenting and reporting to the IC is also correct — it creates an account and triggers the redressal process." },
          { text: "Laugh it off to ease the tension", verdict: "wrong", outcome: "Laughing along signals approval and can make the target feel more isolated." }
        ],
        explain: "Choices branch the story — learners see the consequences of each response in real time. Both intervening supportively and reporting to the IC are valid; silence and laughing it off are not."
      },
      {
        label: "Scenario 2 · You receive a complaint",
        branch: "Branch 2 of 3",
        scenario: "As a manager, a team member quietly tells you that a peer keeps cornering her with unwanted personal comments. She begs you to 'keep it off the record.'",
        question: "What should you do?",
        options: [
          { text: "Promise full secrecy and take no formal action", verdict: "wrong", outcome: "You cannot guarantee total secrecy at the cost of action — that leaves the conduct unaddressed and you non-compliant." },
          { text: "Reassure her about confidentiality, explain the IC process, and support her in filing", verdict: "recommended", outcome: "You respect her dignity, explain her rights and the confidential IC route, and let her make an informed choice — the correct managerial response." },
          { text: "Tell her to confront the peer herself first", verdict: "wrong", outcome: "Putting the burden back on her can increase risk and is not what the Act intends." },
          { text: "Escalate it loudly to the whole team for 'transparency'", verdict: "wrong", outcome: "This breaches confidentiality (Section 16) and exposes her to retaliation." }
        ],
        explain: "A manager should uphold confidentiality, explain the IC/SHe-Box route, and empower the complainant — never force silence or public exposure."
      }
    ]
  }
};

/* Order in which modules are presented */
const MODULE_ORDER = ["mcq", "fib", "mtf", "caseStudy", "simulation"];
