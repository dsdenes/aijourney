/**
 * Prompting best-practices reference — injected into every LLM analysis call
 * so the model can score and optimize prompts against these rules.
 */
export const PROMPTING_PRACTICES_CONTEXT = `
=== PROMPTING BEST PRACTICES REFERENCE ===

You must evaluate and improve prompts based on ALL of the following 25 proven practices:

1. BE SPECIFIC ABOUT WHAT YOU WANT
Tell the AI exactly what you need — the more detail, the better the answer. Include the topic, audience, length, and key points.

2. GIVE THE AI A ROLE
Start with "You are a..." to set the expertise level and writing style.

3. PROVIDE CONTEXT AND BACKGROUND
Tell the AI the situation, who it's for, and why you need it. Without context, the AI has to guess.

4. SPECIFY THE FORMAT YOU WANT
Request bullet points, tables, numbered lists, emails, paragraphs, etc. Don't leave format to chance.

5. SET THE TONE AND STYLE
Specify formal, casual, friendly, professional, humorous, etc. Include who the audience is.

6. BREAK COMPLEX TASKS INTO STEPS
For big tasks, use step-by-step instructions. Ask the AI to do one step at a time.

7. GIVE EXAMPLES OF WHAT YOU WANT (FEW-SHOT)
Show the AI a sample of the style or format you like so it can match it.

8. TELL THE AI WHAT NOT TO DO
Mention things to avoid — jargon, certain topics, a specific tone, excessive length, etc.

9. SET A WORD OR LENGTH LIMIT
Specify word count, sentence count, or paragraph count to force conciseness.

10. ASK THE AI TO THINK STEP BY STEP
Add "think step by step" for more thoughtful, accurate, well-reasoned answers.

11. ITERATE — DON'T START OVER
If the answer isn't perfect, refine by saying what to change rather than rewriting from scratch.

12. ASK FOR MULTIPLE OPTIONS
Say "give me 3 versions" or "suggest 5 alternatives" to have choices.

13. PASTE YOUR DATA DIRECTLY IN
Don't describe data — paste it. The AI works with real numbers/text, not guesses.

14. SPECIFY YOUR AUDIENCE
Tell the AI who will read the output — CEO, intern, client, technical team, etc.

15. USE THE AI AS A BRAINSTORMING PARTNER
Ask for ideas, alternatives, or creative angles to jumpstart thinking.

16. ASK THE AI TO CHECK ITS OWN WORK
After getting an answer, ask it to review for errors, gaps, or inconsistencies.

17. GIVE DEADLINES AND PRIORITY INFO
Tell the AI which parts are urgent or most important so it focuses accordingly.

18. ASK "WHAT QUESTIONS SHOULD I BE ASKING?"
When stuck, ask the AI to surface important angles or risks you haven't thought of.

19. USE THE AI TO SIMPLIFY COMPLEX TEXT
Paste confusing documents and ask for plain-language explanations.

20. TELL THE AI TO BE HONEST ABOUT UNCERTAINTY
Say "If you're not sure, tell me" to prevent confident-sounding wrong answers.

21. REUSE YOUR BEST PROMPTS AS TEMPLATES
Save prompts that work and reuse them by swapping details.

22. ONE TASK PER PROMPT FOR BEST RESULTS
Ask the AI to do one thing at a time for full attention on each task.

23. ASK THE AI TO ARGUE THE OTHER SIDE
Use "play devil's advocate" to stress-test ideas and find weaknesses.

24. SET THE OUTPUT LANGUAGE CLEARLY
If you need a specific language, state it explicitly with formality preferences.

25. ASK FOR PROS AND CONS BEFORE DECIDING
Get structured advantages/disadvantages lists for better decision-making.

=== END OF PRACTICES ===
`;
