export interface PromptingPractice {
  id: number;
  title: string;
  summary: string;
  why: string;
  examples: { bad: string; good: string; whyBetter: string }[];
}

export const promptingPractices: PromptingPractice[] = [
  {
    id: 1,
    title: 'Be Specific About What You Want',
    summary: 'Tell the AI exactly what you need — the more detail, the better the answer.',
    why: "Vague requests get vague answers. The AI doesn't know what's in your head, so spell it out clearly.",
    examples: [
      {
        bad: 'Write something about our product.',
        good: 'Write a 150-word product description for our new wireless headphones aimed at remote workers, highlighting noise cancellation and 12-hour battery life.',
        whyBetter:
          'The AI knows the product, the audience, the key features, and the length — so it can nail it on the first try.',
      },
      {
        bad: 'Help me with an email.',
        good: 'Write a polite email to a client explaining that their delivery will be 3 days late due to a supplier issue. Keep it under 100 words and offer a 10% discount as an apology.',
        whyBetter:
          'Now the AI knows the situation, the tone, the length, and what solution to offer.',
      },
    ],
  },
  {
    id: 2,
    title: 'Give the AI a Role',
    summary: 'Start with "You are a..." to tell the AI what kind of expert it should act as.',
    why: 'When you give the AI a role, it adjusts its writing style, vocabulary, and depth of knowledge to match that role — just like asking a colleague from a specific department.',
    examples: [
      {
        bad: 'How do I handle a complaint?',
        good: 'You are an experienced customer service manager. A client is upset because they received the wrong item. Draft a response that acknowledges their frustration, apologizes, and explains the replacement process.',
        whyBetter:
          'The AI now responds like a customer service pro — empathetic, solution-focused, and professional.',
      },
      {
        bad: 'Explain our quarterly results.',
        good: 'You are a CFO presenting to the board. Summarize these quarterly results in 5 bullet points, focusing on revenue growth, cost reduction, and projections for next quarter: [paste data].',
        whyBetter:
          'The AI frames the results the way a finance executive would — concise, strategic, and board-ready.',
      },
    ],
  },
  {
    id: 3,
    title: 'Provide Context and Background',
    summary: "Tell the AI the situation, who it's for, and why you need it.",
    why: 'Without context, the AI has to guess. With context, it gives answers that actually fit your situation.',
    examples: [
      {
        bad: 'Write a meeting agenda.',
        good: 'Write a 30-minute meeting agenda for a weekly team sync with 6 marketing team members. We need to cover: campaign performance from last week, upcoming deadlines, and budget approval for the new social media tool.',
        whyBetter:
          'The AI knows the meeting length, team size, department, and specific topics to cover.',
      },
      {
        bad: 'Create a job posting.',
        good: "We're a 50-person tech startup in Budapest. We need a job posting for a junior graphic designer who will create social media visuals and marketing materials. The role is hybrid (3 days office, 2 days remote). Must know Figma and Adobe Creative Suite.",
        whyBetter:
          'The AI understands your company size, culture, and the exact requirements for the role.',
      },
    ],
  },
  {
    id: 4,
    title: 'Specify the Format You Want',
    summary:
      'Tell the AI if you want bullet points, a table, a numbered list, an email, a paragraph, etc.',
    why: "The AI will match your requested format exactly. If you don't specify, it picks whatever it thinks is best — which often isn't what you need.",
    examples: [
      {
        bad: 'Compare these two software tools.',
        good: 'Compare Slack and Microsoft Teams in a table with these columns: Feature, Slack, Teams. Include rows for: pricing, video calls, file sharing, integrations, and mobile app quality.',
        whyBetter: 'You get a clean, ready-to-use comparison table instead of a long paragraph.',
      },
      {
        bad: 'Give me ideas for team building.',
        good: 'List 10 team building activities for a remote team of 15 people. Format as a numbered list with the activity name in bold, followed by a one-sentence description and the estimated time needed.',
        whyBetter:
          "Each idea comes in a consistent, scannable format that's easy to share with your team.",
      },
    ],
  },
  {
    id: 5,
    title: 'Set the Tone and Style',
    summary:
      'Tell the AI how it should "sound" — formal, casual, friendly, professional, humorous, etc.',
    why: 'The same information written in a formal tone vs. a casual tone reads completely differently. The AI needs to know who the audience is and how you want to come across.',
    examples: [
      {
        bad: 'Write a message about our company event.',
        good: 'Write a fun, enthusiastic Slack message inviting the team to our Friday afternoon rooftop BBQ. Keep it casual and use 1-2 emojis. Mention that the company is covering drinks and food.',
        whyBetter:
          'The AI writes a message that actually sounds like a human posted it in Slack, not a corporate announcement.',
      },
      {
        bad: 'Tell the team about the new policy.',
        good: 'Write a formal internal memo to all employees about the updated work-from-home policy. Use a professional but warm tone. Include the key changes, effective date (April 1), and who to contact for questions.',
        whyBetter:
          'The AI matches the serious but approachable tone appropriate for a policy change.',
      },
    ],
  },
  {
    id: 6,
    title: 'Break Complex Tasks into Steps',
    summary:
      'For big tasks, tell the AI to work through it step by step instead of doing everything at once.',
    why: 'When you ask for everything at once, important details get lost. Step-by-step instructions give you better control and better results.',
    examples: [
      {
        bad: 'Create a marketing plan.',
        good: "I need to create a marketing plan for our new product launch. Let's do this step by step:\nStep 1: Identify our target audience (remote workers aged 25-40)\nStep 2: List 5 marketing channels we should use\nStep 3: Create a timeline for the first 3 months\nStart with Step 1.",
        whyBetter:
          'You get detailed output for each step and can review/adjust before moving to the next one.',
      },
      {
        bad: 'Help me prepare for the presentation.',
        good: "Help me prepare for a 15-minute presentation to senior management about our Q3 results. Step 1: Create an outline with 5-6 slides. Step 2: Write talking points for each slide. Step 3: Suggest 3 data visualizations. Let's start with the outline.",
        whyBetter: "Each step gets full attention, and you can steer the AI's direction as you go.",
      },
    ],
  },
  {
    id: 7,
    title: 'Give Examples of What You Want',
    summary: 'Show the AI a sample of the style or format you like — "make it like this."',
    why: 'Showing is better than telling. When the AI sees an example, it understands your expectations much faster than if you try to describe them. This is called "few-shot prompting" — but really it\'s just showing a sample.',
    examples: [
      {
        bad: 'Write social media posts about our product.',
        good: 'Write 3 LinkedIn posts about our new project management tool. Here\'s an example of the style I like:\n\n"Tired of switching between 5 different apps to manage one project? 🎯\nWe built [Product] so your whole team stays on one page.\n→ Tasks, deadlines, files — all in one place.\nTry it free for 14 days."\n\nNow write 3 more in this same style.',
        whyBetter:
          'The AI copies the tone, length, structure, and emoji usage from your example perfectly.',
      },
      {
        bad: 'Summarize this report.',
        good: "Summarize this report in the following format:\n\n**Key Finding:** [one sentence]\n**Impact:** [who is affected and how]\n**Action Needed:** [what to do next]\n\nHere's the report: [paste report]",
        whyBetter:
          'The AI follows your exact summary structure, making all future summaries consistent.',
      },
    ],
  },
  {
    id: 8,
    title: 'Tell the AI What NOT to Do',
    summary: 'Mention things you want to avoid — jargon, certain topics, a specific tone, etc.',
    why: "Sometimes it's easier to exclude what you don't want than to describe everything you do want. Constraints help the AI stay on track.",
    examples: [
      {
        bad: 'Explain cloud computing.',
        good: "Explain cloud computing to a non-technical manager in 100 words. Don't use technical jargon, acronyms, or mention specific providers like AWS or Azure. Use a simple analogy instead.",
        whyBetter:
          'The AI avoids overwhelming your audience with tech speak and keeps it genuinely simple.',
      },
      {
        bad: 'Write a product review.',
        good: "Write a balanced product review of our CRM software for a blog post. Don't make it sound like an advertisement — include 2 genuine limitations alongside the strengths. Keep it honest and helpful.",
        whyBetter:
          'The review reads as trustworthy because the AI was told to avoid being promotional.',
      },
    ],
  },
  {
    id: 9,
    title: 'Set a Word or Length Limit',
    summary: 'Tell the AI how long (or short) the response should be.',
    why: 'Without a length limit, the AI tends to write too much. Setting a word count forces it to be concise and focused on what matters most.',
    examples: [
      {
        bad: 'Write a company bio.',
        good: "Write a company bio for our website in exactly 50 words. We're a Budapest-based HR consultancy founded in 2018, specializing in talent acquisition and employer branding for tech companies.",
        whyBetter:
          "You get a tight, punchy bio instead of three paragraphs you'll have to cut down yourself.",
      },
      {
        bad: 'Summarize this article.',
        good: "Summarize this article in 3 sentences maximum. Focus only on the main conclusion and the one most surprising finding. Here's the article: [paste]",
        whyBetter:
          'Three sentences is easy to read and share — perfect for a quick Slack update to your team.',
      },
    ],
  },
  {
    id: 10,
    title: 'Ask the AI to Think Before Answering',
    summary: 'Add "think step by step" or "reason through this" to get more thoughtful answers.',
    why: 'When you ask the AI to think through a problem, it catches mistakes it would otherwise make and gives more accurate, well-reasoned answers.',
    examples: [
      {
        bad: 'Should we hire a freelancer or a full-time employee?',
        good: 'We need a graphic designer for about 15 hours per week. Think step by step: compare hiring a freelancer vs. a full-time employee. Consider cost, flexibility, quality consistency, onboarding time, and legal obligations in Hungary. Then give me your recommendation.',
        whyBetter:
          'The AI considers each factor systematically instead of giving a quick, oversimplified answer.',
      },
      {
        bad: 'What went wrong with our campaign?',
        good: 'Here are the results of our email campaign: 2% open rate, 0.1% click rate, sent to 10,000 subscribers on Monday at 3pm. Think step by step about what could have gone wrong — subject line, timing, audience targeting, content — and suggest 3 specific fixes.',
        whyBetter: 'The AI analyzes each possible factor instead of guessing one generic answer.',
      },
    ],
  },
  {
    id: 11,
    title: "Iterate — Don't Start Over",
    summary:
      "If the first answer isn't perfect, tell the AI what to change. Don't rewrite your whole prompt.",
    why: "The AI remembers your conversation. It's faster and better to say 'make it shorter' or 'make it more formal' than to start from scratch.",
    examples: [
      {
        bad: '[Rewrites entire prompt from scratch because the answer was too long]',
        good: "That's good, but it's too long. Shorten it to 100 words and make the tone more casual.",
        whyBetter:
          'The AI keeps the good parts and only adjusts what you asked for. Faster and often better results.',
      },
      {
        bad: '[Copies the answer, pastes it into a new chat, asks to edit it]',
        good: 'I like points 1, 3, and 5. Remove the others and expand point 3 with a real-world example from the retail industry.',
        whyBetter:
          "You're building on the AI's work instead of throwing it away. Each iteration gets closer to what you need.",
      },
    ],
  },
  {
    id: 12,
    title: 'Ask for Multiple Options',
    summary: 'Say "give me 3 versions" or "suggest 5 alternatives" so you can pick the best one.',
    why: "The first answer might not be the best. Getting multiple versions gives you choices and often sparks ideas you wouldn't have thought of.",
    examples: [
      {
        bad: 'Write a subject line for our newsletter.',
        good: 'Write 5 different email subject lines for our monthly newsletter about productivity tips. Make each one a different style: one question, one with a number, one with urgency, one funny, one straightforward.',
        whyBetter:
          'You get to choose from 5 styles instead of hoping the one the AI picks is the right one.',
      },
      {
        bad: 'Name our new feature.',
        good: 'Suggest 5 names for our new project dashboard feature. The names should be short (1-2 words), modern, and easy to understand. For each name, explain in one sentence why it works.',
        whyBetter:
          'You get a shortlist with reasoning, making it easier to discuss with your team and pick a winner.',
      },
    ],
  },
  {
    id: 13,
    title: 'Paste Your Data Directly In',
    summary:
      "Don't describe your data — paste it. The AI can read spreadsheets, emails, reports, etc.",
    why: 'When you paste actual data, the AI works with real numbers and real text instead of making things up. This is how you get accurate, usable output.',
    examples: [
      {
        bad: "Analyze our sales numbers — they've been declining.",
        good: 'Here are our monthly sales figures for 2025:\nJan: €45K, Feb: €42K, Mar: €38K, Apr: €35K, May: €33K, Jun: €29K\n\nIdentify the trend, calculate the average monthly decline, and suggest 3 possible reasons for the drop.',
        whyBetter:
          'The AI gives you a precise analysis (€2,667/month decline) instead of generic advice about declining sales.',
      },
      {
        bad: 'Can you fix my email? It sounds weird.',
        good: 'Fix this email to sound more professional and concise:\n\n"Hi John, so basically I was wondering if maybe you could possibly send me that report thing from last week? I kind of need it for the meeting tomorrow. Thanks a lot!!"',
        whyBetter:
          'The AI sees the exact text and can fix it precisely, instead of guessing what your email says.',
      },
    ],
  },
  {
    id: 14,
    title: 'Specify Your Audience',
    summary: 'Tell the AI who will read or hear the output.',
    why: 'An explanation written for your CEO is very different from one written for a new intern. The audience determines the vocabulary, depth, and tone.',
    examples: [
      {
        bad: 'Explain our new benefits package.',
        good: "Explain our new benefits package in a friendly email to all employees. Assume most people are non-technical and may not understand terms like 'vesting period' or 'deductible.' Keep it simple and highlight what's in it for them.",
        whyBetter:
          'The AI writes for regular people, not HR professionals, so everyone actually understands the email.',
      },
      {
        bad: 'Write a report on AI adoption.',
        good: 'Write a one-page executive summary on AI adoption in our industry for the CEO. Focus on competitive risks, cost savings potential, and one recommended next step. No technical details — decision-maker level only.',
        whyBetter:
          'The CEO gets what they need: business impact and a recommendation, not a tech tutorial.',
      },
    ],
  },
  {
    id: 15,
    title: 'Use the AI as a Brainstorming Partner',
    summary: 'Ask for ideas, alternatives, or creative angles — then pick the best ones yourself.',
    why: "The AI can generate dozens of ideas in seconds. You don't have to use them all — use it to jumpstart your thinking and break out of creative blocks.",
    examples: [
      {
        bad: 'I need ideas.',
        good: "I'm planning a team offsite for 20 people (mix of developers and designers). Budget is €2,000. The goal is team bonding after a stressful quarter. Give me 8 creative activity ideas that are inclusive, don't require athletic ability, and can happen in Budapest in winter.",
        whyBetter:
          "You get targeted, realistic ideas that fit your actual constraints — not generic suggestions like 'go bowling.'",
      },
      {
        bad: 'How can we improve employee engagement?',
        good: "We're a 50-person company. Recent survey shows employees feel disconnected from leadership. Brainstorm 10 low-cost ideas (under €500 each) to improve employee-leadership connection. List them from easiest to implement to hardest.",
        whyBetter:
          'The ideas are organized by effort level and fit your budget and specific problem.',
      },
    ],
  },
  {
    id: 16,
    title: 'Ask the AI to Check Its Own Work',
    summary: 'After getting an answer, say "Now review this for errors" or "What did you miss?"',
    why: 'The AI can catch its own mistakes when you tell it to double-check. This is like asking a colleague to proofread — it spots things the first pass missed.',
    examples: [
      {
        bad: '[Takes the first answer and uses it immediately]',
        good: 'Now review the email you just wrote. Check for: (1) any grammatical errors, (2) whether the tone is consistently professional, (3) if any important information is missing. List any issues you find.',
        whyBetter:
          'The AI often catches typos, inconsistencies, or missing details it overlooked in the first draft.',
      },
      {
        bad: '[Assumes the data analysis is correct]',
        good: 'Double-check your calculations. Verify the percentages, make sure the totals add up, and confirm that your conclusions match the data I provided.',
        whyBetter:
          'AI can make math errors. Asking it to verify catches mistakes before you share the analysis with your boss.',
      },
    ],
  },
  {
    id: 17,
    title: 'Give Deadlines and Priority Info',
    summary: 'Tell the AI which parts are urgent, most important, or have deadlines.',
    why: 'When the AI knows what matters most, it focuses its answer on the high-priority items instead of treating everything equally.',
    examples: [
      {
        bad: 'Help me plan this project.',
        good: 'Help me plan the website redesign project. The hard deadline is March 15. The most critical deliverable is the homepage — that needs to be done by March 1. The blog section is nice-to-have. Create a timeline that prioritizes accordingly.',
        whyBetter:
          'The AI builds a plan around your real constraints instead of spreading effort evenly across everything.',
      },
      {
        bad: 'Write responses to these 5 emails.',
        good: 'Write responses to these 5 emails. Email #3 is the most urgent (client complaint — respond within 2 hours). Emails #1 and #5 are low priority (internal FYI). Start with #3, then do #2 and #4.',
        whyBetter:
          'The AI prioritizes the urgent email and puts the most effort where it matters most.',
      },
    ],
  },
  {
    id: 18,
    title: "Ask 'What Questions Should I Be Asking?'",
    summary: "When you're stuck, ask the AI what you might be missing or should consider.",
    why: "You don't always know what you don't know. The AI can surface important angles, risks, or questions you haven't thought of.",
    examples: [
      {
        bad: "We're launching a new product next month.",
        good: "We're launching a new SaaS product for small businesses next month. I'm the project manager. What are the 10 most important questions I should be asking my team right now to make sure the launch goes smoothly?",
        whyBetter:
          'The AI acts as a consultant, helping you think of things like rollback plans, customer support readiness, and analytics tracking.',
      },
      {
        bad: 'I have a job interview tomorrow.',
        good: 'I have a job interview tomorrow for a senior marketing manager role at a fintech startup. What are 7 questions I should be prepared to answer, and what are 5 smart questions I should ask the interviewer?',
        whyBetter:
          'You get prep for both sides of the interview — answering and asking — which most people forget.',
      },
    ],
  },
  {
    id: 19,
    title: 'Use the AI to Simplify Complex Text',
    summary:
      'Paste in confusing documents, contracts, or reports and ask the AI to explain them in plain language.',
    why: 'Legal documents, technical reports, and policy texts are often written in unnecessarily complex language. The AI can translate them into language everyone understands.',
    examples: [
      {
        bad: 'Explain this contract.',
        good: 'Explain this contract clause in plain language that a non-lawyer can understand. Highlight any risks or obligations for our company:\n\n"The Licensor hereby grants to the Licensee a non-exclusive, non-transferable, revocable license to use the Software solely for the Licensee\'s internal business purposes, subject to the terms and conditions herein..."',
        whyBetter:
          'The AI translates legalese into something like: "They let us use the software for our own work, but they can take it away, and we can\'t share it with anyone else."',
      },
      {
        bad: 'What does this regulation mean?',
        good: 'I work in HR in Hungary. Explain Article 17 of GDPR (Right to Erasure) in simple terms. What does it mean for how we store employee data? Give me 3 practical things our HR team needs to do to be compliant.',
        whyBetter:
          'You get a plain-language explanation plus actionable to-dos, not a legal lecture.',
      },
    ],
  },
  {
    id: 20,
    title: 'Tell the AI to Be Honest About Uncertainty',
    summary:
      'Say "If you\'re not sure, tell me" — this prevents the AI from confidently making things up.',
    why: "AI can sound very confident even when it's wrong. Telling it to flag uncertainty makes it honest about what it knows and what it's guessing.",
    examples: [
      {
        bad: 'What are the tax rules for remote workers in Hungary?',
        good: "What are the current tax rules for remote workers in Hungary as of 2025? If you're not sure about any detail, clearly say 'I'm not certain about this.' I'll verify with our accountant, but I need a starting point.",
        whyBetter:
          'The AI flags uncertain parts instead of presenting guesses as facts. You know what to double-check.',
      },
      {
        bad: 'Is this legal?',
        good: "We want to include a non-compete clause in our employment contracts in Hungary. What are the legal requirements and limitations? If any of this has changed recently or you're uncertain, please flag it. This is for initial research — our lawyer will review.",
        whyBetter:
          'The AI gives you useful research while being transparent about what needs legal verification.',
      },
    ],
  },
  {
    id: 21,
    title: 'Reuse Your Best Prompts as Templates',
    summary:
      'When a prompt works perfectly, save it and reuse it with different details next time.',
    why: "You don't need to reinvent the wheel every time. Saving and reusing great prompts saves time and gives you consistently good results.",
    examples: [
      {
        bad: '[Writes a new prompt from scratch every single time]',
        good: 'Save this as your "weekly report" template and just swap the details each week:\n\n"Write a weekly status report for [project name]. Period: [dates]. Include: (1) what was completed, (2) what\'s in progress, (3) blockers, (4) plan for next week. Keep it under 200 words. Here\'s my raw notes: [paste notes]"',
        whyBetter:
          'You fill in the blanks in 30 seconds instead of thinking about how to prompt from scratch every week.',
      },
      {
        bad: '[Tries to remember what worked last time]',
        good: 'Keep a "Prompt Library" document. Example entry:\n\n📝 Purpose: Client follow-up email\n✅ Prompt: "Write a friendly follow-up email to [client name] about [topic]. We last spoke on [date]. Remind them about [action item] and suggest a meeting next week. Keep it under 80 words."\n\nJust fill in the brackets each time.',
        whyBetter:
          'Your prompt library becomes a personal productivity toolkit that gets better over time.',
      },
    ],
  },
  {
    id: 22,
    title: 'One Task Per Prompt for Best Results',
    summary: 'Ask the AI to do one thing at a time rather than five things in one message.',
    why: 'When you cram multiple tasks into one prompt, the AI might rush through some or skip details. One task per prompt ensures full attention on each.',
    examples: [
      {
        bad: "Write me an email, create a project plan, summarize yesterday's meeting, and list next steps for the product launch.",
        good: "Let's tackle these one at a time. First: Summarize yesterday's product launch meeting based on these notes: [paste notes]. Focus on decisions made and action items.",
        whyBetter:
          "Each task gets the AI's full attention and you can review one deliverable at a time.",
      },
      {
        bad: 'Create a presentation about Q3 results with speaker notes and also draft a follow-up email.',
        good: "First, let's create a slide outline for a Q3 results presentation. I'll need 6 slides covering: revenue, costs, key wins, challenges, team highlights, and Q4 goals.",
        whyBetter:
          'Start with the outline, then add speaker notes in the next prompt, then draft the email — each one polished.',
      },
    ],
  },
  {
    id: 23,
    title: 'Ask the AI to Argue the Other Side',
    summary:
      'Use "play devil\'s advocate" or "give me the counter-argument" to stress-test your ideas.',
    why: "It's easy to fall in love with your own idea. The AI can poke holes in it so you can fix weaknesses before presenting it to others.",
    examples: [
      {
        bad: 'Is our marketing strategy good?',
        good: "Here's our marketing strategy for Q1: [paste strategy]. Play devil's advocate — what are the 5 biggest risks or weaknesses in this plan? Be brutally honest. What could go wrong?",
        whyBetter:
          'You discover blind spots before your stakeholders do, and you can address them proactively.',
      },
      {
        bad: 'Should we switch to this new tool?',
        good: "We're considering switching from Asana to Monday.com. I think it's a good idea because of pricing. Argue against this switch — give me the top 5 reasons why it might be a bad decision.",
        whyBetter:
          'Now you have both sides and can make a truly informed decision, not just confirm what you already believe.',
      },
    ],
  },
  {
    id: 24,
    title: 'Set the Output Language Clearly',
    summary: 'If you need the response in a specific language, say so explicitly.',
    why: 'The AI defaults to the language you write in, but for multilingual work, being explicit avoids mix-ups and ensures consistent output.',
    examples: [
      {
        bad: 'Translate this email. [pastes Hungarian email]',
        good: "Translate this email from Hungarian to English. Keep the professional tone. If any Hungarian expressions don't translate directly, rephrase them naturally in English rather than translating word-for-word:\n\n[paste Hungarian email]",
        whyBetter:
          "The AI knows the source language, target language, and how to handle expressions that don't translate literally.",
      },
      {
        bad: 'Write a message for our German clients.',
        good: 'Write a friendly business email in German (formal Sie form) to our clients announcing a 2-week holiday closure from Dec 23 to Jan 5. Include emergency contact info: support@company.com. Keep it under 100 words.',
        whyBetter:
          'The AI uses the correct formality level (Sie vs. du) and writes natural German, not translated English.',
      },
    ],
  },
  {
    id: 25,
    title: 'Ask for Pros and Cons Before Deciding',
    summary:
      'Before making a decision, ask the AI to lay out the advantages and disadvantages of each option.',
    why: 'Getting a structured pros-and-cons list helps you make better decisions and gives you a framework to discuss with colleagues.',
    examples: [
      {
        bad: 'Should we use Zoom or Google Meet?',
        good: "We're choosing between Zoom and Google Meet for our company-wide video calls. Team size: 80 people. We already use Google Workspace. List 5 pros and 5 cons for each option, organized in a table. Then give your recommendation based on our situation.",
        whyBetter:
          'You get a decision-ready comparison instead of a generic overview. The recommendation considers your specific context.',
      },
      {
        bad: 'Should I take this job offer?',
        good: 'I received a job offer: Senior PM at a fintech startup, 20% salary increase, but longer commute and early-stage company (riskier). My current role is stable but limited growth. List the pros and cons of switching, considering career growth, financial impact, work-life balance, and job security.',
        whyBetter:
          "The AI structures your decision across multiple dimensions so you don't just focus on salary.",
      },
    ],
  },
];
