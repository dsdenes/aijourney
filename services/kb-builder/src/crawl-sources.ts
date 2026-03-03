/**
 * Crawl source configuration.
 * In MVP, stored in-memory with defaults. Later can be persisted to MongoDB.
 */

export interface CrawlSource {
	id: string;
	url: string;
	name: string;
	enabled: boolean;
	maxPages: number;
	addedAt: string;
}

const sources: CrawlSource[] = [
	// ── Newsletters ──
	{
		id: "simonwillison",
		url: "https://simonwillison.net/",
		name: "Simon Willison's Blog",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "the-batch-deeplearning-ai",
		url: "https://www.deeplearning.ai/the-batch/",
		name: "The Batch (deeplearning.ai)",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "ahead-of-ai",
		url: "https://magazine.sebastianraschka.com/",
		name: "Ahead of AI (Sebastian Raschka)",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "one-useful-thing",
		url: "https://www.oneusefulthing.org/",
		name: "One Useful Thing (Ethan Mollick)",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "ben-s-bites",
		url: "https://bensbites.beehiiv.com/",
		name: "Ben's Bites",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "the-neuron",
		url: "https://www.theneurondaily.com/",
		name: "The Neuron",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	// ── Provider Best Practices ──
	{
		id: "openai-blog",
		url: "https://openai.com/blog",
		name: "OpenAI Blog",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "anthropic-blog",
		url: "https://www.anthropic.com/research",
		name: "Anthropic Research Blog",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "google-ai-blog",
		url: "https://blog.google/technology/ai/",
		name: "Google AI Blog",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "aws-ai-blog",
		url: "https://aws.amazon.com/blogs/machine-learning/",
		name: "AWS Machine Learning Blog",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	// ── Provider News & Research ──
	{
		id: "openai-news",
		url: "https://openai.com/news/",
		name: "OpenAI News",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "microsoft-ai-blog",
		url: "https://blogs.microsoft.com/ai/",
		name: "Microsoft AI Blog",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "meta-ai-blog",
		url: "https://ai.meta.com/blog/",
		name: "Meta AI Blog",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "hugging-face-blog",
		url: "https://huggingface.co/blog",
		name: "Hugging Face Blog",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	// ── Research Radar ──
	{
		id: "arxiv-cs-ai",
		url: "https://arxiv.org/list/cs.AI/recent",
		name: "arXiv cs.AI Recent",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	{
		id: "papers-with-code",
		url: "https://paperswithcode.com/latest",
		name: "Papers With Code Latest",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	{
		id: "the-gradient",
		url: "https://thegradient.pub/",
		name: "The Gradient",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	// ── Benchmarks & Leaderboards ──
	{
		id: "lmsys-chatbot-arena",
		url: "https://lmarena.ai/",
		name: "LMSYS Chatbot Arena",
		enabled: true,
		maxPages: 30,
		addedAt: new Date().toISOString(),
	},
	{
		id: "artificial-analysis",
		url: "https://artificialanalysis.ai/",
		name: "Artificial Analysis",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	{
		id: "open-llm-leaderboard",
		url: "https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard",
		name: "Open LLM Leaderboard",
		enabled: true,
		maxPages: 20,
		addedAt: new Date().toISOString(),
	},
	{
		id: "scale-ai-research",
		url: "https://scale.com/research",
		name: "Scale AI Research",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	// ── Security & Governance ──
	{
		id: "owasp-llm-top-10",
		url: "https://genai.owasp.org/",
		name: "OWASP GenAI",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	{
		id: "nist-ai-rmf",
		url: "https://www.nist.gov/artificial-intelligence",
		name: "NIST AI",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	{
		id: "ai-incident-database",
		url: "https://incidentdatabase.ai/",
		name: "AI Incident Database",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	{
		id: "eu-ai-act-info",
		url: "https://artificialintelligenceact.eu/",
		name: "EU AI Act",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	{
		id: "future-of-life-ai",
		url: "https://futureoflife.org/area/artificial-intelligence/",
		name: "Future of Life Institute AI",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	// ── Incidents & Learning ──
	{
		id: "ai-snake-oil",
		url: "https://www.aisnakeoil.com/",
		name: "AI Snake Oil (Narayanan & Kapoor)",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "gary-marcus",
		url: "https://garymarcus.substack.com/",
		name: "Gary Marcus (AI Critic)",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	// ── MLOps ──
	{
		id: "mlops-community",
		url: "https://mlops.community/blog/",
		name: "MLOps Community Blog",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "weights-and-biases-blog",
		url: "https://wandb.ai/fully-connected",
		name: "Weights & Biases Blog",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "langchain-blog",
		url: "https://blog.langchain.dev/",
		name: "LangChain Blog",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "llamaindex-blog",
		url: "https://www.llamaindex.ai/blog",
		name: "LlamaIndex Blog",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	// ── Research Context ──
	{
		id: "distill-pub",
		url: "https://distill.pub/",
		name: "Distill.pub (Research Explanations)",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	{
		id: "lilianweng-blog",
		url: "https://lilianweng.github.io/",
		name: "Lil'Log (Lilian Weng)",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	// ── Newsletters (high-signal) ──
	{
		id: "reuters-ai-intelligencer",
		url: "https://www.reuters.com/newsletters/reuters-ai/",
		name: "Reuters Artificial Intelligencer",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "mit-tech-review-algorithm",
		url: "https://forms.technologyreview.com/newsletters/ai-demystified-the-algorithm/",
		name: "MIT Technology Review — The Algorithm",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "ieee-spectrum-ai-alert",
		url: "https://engage.ieee.org/AI-Alert-Sign-Up.html",
		name: "IEEE Spectrum — AI Alert",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	{
		id: "ft-ai-shift",
		url: "https://www.ft.com/the-ai-shift",
		name: "Financial Times — The AI Shift",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	// ── Provider Best Practices (docs) ──
	{
		id: "openai-production-best-practices",
		url: "https://developers.openai.com/api/docs/guides/production-best-practices/",
		name: "OpenAI — Production Best Practices",
		enabled: true,
		maxPages: 30,
		addedAt: new Date().toISOString(),
	},
	{
		id: "openai-guides-index",
		url: "https://developers.openai.com/resources/guides/",
		name: "OpenAI — Guides Index",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	{
		id: "anthropic-prompt-engineering",
		url: "https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview",
		name: "Anthropic — Prompt Engineering Overview",
		enabled: true,
		maxPages: 30,
		addedAt: new Date().toISOString(),
	},
	{
		id: "anthropic-context-engineering",
		url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents",
		name: "Anthropic — Effective Context Engineering for AI Agents",
		enabled: true,
		maxPages: 20,
		addedAt: new Date().toISOString(),
	},
	// ── Provider News/Research ──
	{
		id: "google-deepmind-blog",
		url: "https://deepmind.google/blog/",
		name: "Google DeepMind Blog",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "microsoft-ai-blog-official",
		url: "https://www.microsoft.com/en-us/ai/blog/",
		name: "Microsoft AI Blog (Official)",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	{
		id: "amazon-science-blog",
		url: "https://www.amazon.science/blog",
		name: "Amazon Science Blog",
		enabled: true,
		maxPages: 100,
		addedAt: new Date().toISOString(),
	},
	// ── Research Radar ──
	{
		id: "arxiv-rss-feeds",
		url: "https://info.arxiv.org/help/rss.html",
		name: "arXiv — RSS Feeds Help",
		enabled: true,
		maxPages: 20,
		addedAt: new Date().toISOString(),
	},
	{
		id: "openreview-neurips-2025",
		url: "https://openreview.net/group?id=NeurIPS.cc%2F2025%2FConference",
		name: "OpenReview — NeurIPS 2025",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	{
		id: "huggingface-trending-papers",
		url: "https://huggingface.co/papers/trending",
		name: "Hugging Face — Trending Papers",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	// ── Benchmarks & Leaderboards ──
	{
		id: "lmsys-org",
		url: "https://lmsys.org/",
		name: "LMSYS (Org Home)",
		enabled: true,
		maxPages: 30,
		addedAt: new Date().toISOString(),
	},
	{
		id: "chatbot-arena-web",
		url: "https://chatbot-arena.web.app/",
		name: "Chatbot Arena (LMSYS)",
		enabled: true,
		maxPages: 30,
		addedAt: new Date().toISOString(),
	},
	{
		id: "stanford-helm",
		url: "https://crfm.stanford.edu/helm/latest/",
		name: "Stanford CRFM — HELM",
		enabled: true,
		maxPages: 30,
		addedAt: new Date().toISOString(),
	},
	{
		id: "hf-open-llm-leaderboard-hub",
		url: "https://huggingface.co/open-llm-leaderboard",
		name: "Hugging Face — Open LLM Leaderboard Hub",
		enabled: true,
		maxPages: 20,
		addedAt: new Date().toISOString(),
	},
	// ── Security & Governance ──
	{
		id: "owasp-top-10-llm-project",
		url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
		name: "OWASP — Top 10 for LLM Applications (Project)",
		enabled: true,
		maxPages: 30,
		addedAt: new Date().toISOString(),
	},
	{
		id: "owasp-genai-top-10-2025",
		url: "https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/",
		name: "OWASP GenAI — Top 10 (2025)",
		enabled: true,
		maxPages: 20,
		addedAt: new Date().toISOString(),
	},
	{
		id: "mitre-atlas",
		url: "https://atlas.mitre.org/",
		name: "MITRE — ATLAS",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	{
		id: "nist-ai-rmf-pdf",
		url: "https://nvlpubs.nist.gov/nistpubs/ai/nist.ai.100-1.pdf",
		name: "NIST — AI RMF 1.0 (PDF)",
		enabled: true,
		maxPages: 10,
		addedAt: new Date().toISOString(),
	},
	{
		id: "nist-ai-rmf-landing",
		url: "https://www.nist.gov/itl/ai-risk-management-framework",
		name: "NIST — AI RMF Landing Page",
		enabled: true,
		maxPages: 30,
		addedAt: new Date().toISOString(),
	},
	// ── Incidents & Learning ──
	{
		id: "aiid-partnership-on-ai",
		url: "https://partnershiponai.org/workstream/ai-incidents-database/",
		name: "AI Incident Database (Partnership on AI)",
		enabled: true,
		maxPages: 50,
		addedAt: new Date().toISOString(),
	},
	// ── MLOps (reference) ──
	{
		id: "gcp-mlops-architecture",
		url: "https://docs.cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning",
		name: "Google Cloud — MLOps CI/CD/CT Architecture",
		enabled: true,
		maxPages: 20,
		addedAt: new Date().toISOString(),
	},
	{
		id: "azure-ml-mlops",
		url: "https://learn.microsoft.com/en-us/azure/machine-learning/concept-model-management-and-deployment?view=azureml-api-2",
		name: "Azure ML — Model Management & Deployment (MLOps)",
		enabled: true,
		maxPages: 20,
		addedAt: new Date().toISOString(),
	},
	{
		id: "sagemaker-mlops",
		url: "https://aws.amazon.com/sagemaker/ai/mlops/",
		name: "Amazon SageMaker — MLOps Overview",
		enabled: true,
		maxPages: 20,
		addedAt: new Date().toISOString(),
	},
	{
		id: "sagemaker-projects",
		url: "https://docs.aws.amazon.com/sagemaker/latest/dg/sagemaker-projects.html",
		name: "AWS — SageMaker Projects (MLOps Automation)",
		enabled: true,
		maxPages: 20,
		addedAt: new Date().toISOString(),
	},
	// ── Research (conference context) ──
	{
		id: "neurips-2025-cfp",
		url: "https://neurips.cc/Conferences/2025/CallForPapers",
		name: "NeurIPS 2025 Call for Papers",
		enabled: true,
		maxPages: 10,
		addedAt: new Date().toISOString(),
	},
	{
		id: "hf-papers-page-guide",
		url: "https://huggingface.co/blog/AdinaY/a-guide-to-hugging-faces-papers-page",
		name: "Hugging Face — Guide to Papers Page",
		enabled: true,
		maxPages: 10,
		addedAt: new Date().toISOString(),
	},
];

export function getSources(): CrawlSource[] {
	return [...sources];
}

export function getEnabledSources(): CrawlSource[] {
	return sources.filter((s) => s.enabled);
}

export function addSource(source: Omit<CrawlSource, "id" | "addedAt">): CrawlSource {
	const newSource: CrawlSource = {
		...source,
		id: source.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
		addedAt: new Date().toISOString(),
	};
	sources.push(newSource);
	return newSource;
}

export function removeSource(id: string): boolean {
	const idx = sources.findIndex((s) => s.id === id);
	if (idx === -1) return false;
	sources.splice(idx, 1);
	return true;
}

export function updateSource(id: string, updates: Partial<Pick<CrawlSource, "enabled" | "maxPages" | "url" | "name">>): CrawlSource | null {
	const source = sources.find((s) => s.id === id);
	if (!source) return null;
	Object.assign(source, updates);
	return { ...source };
}
