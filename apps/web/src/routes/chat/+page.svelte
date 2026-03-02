<script lang="ts">
  import { api } from '$lib/api';

  interface ChatSource {
    title: string;
    url: string;
    relevance: string;
  }

  interface ChatResponseData {
    answer: string;
    sources: ChatSource[];
    tokensUsed: number;
    model: string;
  }

  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    sources?: ChatSource[];
    model?: string;
    tokensUsed?: number;
    isError?: boolean;
  }

  let query = $state('');
  let messages = $state<ChatMessage[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  function getConversationHistory(): { role: 'user' | 'assistant'; content: string }[] {
    return messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
  }

  async function sendMessage() {
    if (!query.trim() || loading) return;

    const userMessage = query.trim();
    messages = [...messages, { role: 'user', content: userMessage }];
    query = '';
    loading = true;
    error = null;

    try {
      const history = getConversationHistory().slice(0, -1); // exclude the just-added user message
      const res = await api.post<ChatResponseData>('/chat', {
        query: userMessage,
        history,
      });

      if (res.error) {
        throw new Error(res.error.message);
      }

      const chatData = res.data;
      if (chatData) {
        messages = [
          ...messages,
          {
            role: 'assistant',
            content: chatData.answer,
            sources: chatData.sources.filter(s => s.url),
            model: chatData.model,
            tokensUsed: chatData.tokensUsed,
          },
        ];
      } else {
        throw new Error('No response data received');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      error = msg;
      messages = [
        ...messages,
        { role: 'assistant', content: `Sorry, I couldn't process your request: ${msg}`, isError: true },
      ];
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex h-[calc(100vh-6rem)] flex-col">
  <h1 class="mb-4 text-3xl font-bold text-text">AI Knowledge Chat</h1>

  <!-- Messages -->
  <div class="flex-1 space-y-4 overflow-y-auto rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
    {#if messages.length === 0}
      <div class="flex h-full items-center justify-center">
        <div class="text-center">
          <p class="text-lg font-medium text-text-muted">Ask anything about AI tools and techniques</p>
          <p class="mt-2 text-sm text-text-muted">
            Powered by your organization's curated AI knowledge base
          </p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            {#each ['What AI tools should I try first?', 'Best practices for prompt engineering', 'How to integrate AI into my workflow?'] as suggestion}
              <button
                onclick={() => { query = suggestion; }}
                class="rounded-full border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-primary hover:text-primary"
              >
                {suggestion}
              </button>
            {/each}
          </div>
        </div>
      </div>
    {:else}
      {#each messages as msg}
        <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
          <div
            class="max-w-[80%] rounded-lg px-4 py-3 {msg.role === 'user'
              ? 'bg-primary text-white'
              : msg.isError
                ? 'border-2 border-red-500/60 bg-red-950/40 text-red-200'
                : 'bg-surface-darker text-text'}"
          >
            <div class="whitespace-pre-wrap">{msg.content}</div>

            <!-- Sources (for assistant messages) -->
            {#if msg.sources && msg.sources.length > 0}
              <div class="mt-3 border-t border-border/20 pt-2">
                <p class="mb-1 text-[10px] font-semibold uppercase text-text">Sources</p>
                <div class="flex flex-wrap gap-1.5">
                  {#each msg.sources as source}
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/20"
                      title={source.relevance}
                    >
                      <span>📄</span>
                      <span class="max-w-[200px] truncate">{source.title}</span>
                    </a>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Meta info -->
            {#if msg.model}
              <div class="mt-1 flex items-center gap-2 text-[10px] text-text-muted">
                <span>🤖 {msg.model}</span>
                {#if msg.tokensUsed}
                  <span>🔤 {msg.tokensUsed.toLocaleString()} tokens</span>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/each}
      {#if loading}
        <div class="flex justify-start">
          <div class="rounded-lg bg-surface-darker px-4 py-3">
            <div class="flex space-x-1">
              <div class="h-2 w-2 animate-bounce rounded-full bg-text-muted"></div>
              <div class="h-2 w-2 animate-bounce rounded-full bg-text-muted" style="animation-delay: 0.1s"></div>
              <div class="h-2 w-2 animate-bounce rounded-full bg-text-muted" style="animation-delay: 0.2s"></div>
            </div>
          </div>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Error banner -->
  {#if error}
    <div class="mt-2 flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-950/60 px-4 py-3 text-sm font-medium text-red-200 shadow-lg shadow-red-950/20">
      <span class="text-base">⚠️</span>
      <span>{error}</span>
    </div>
  {/if}

  <!-- Input -->
  <form onsubmit={(e) => { e.preventDefault(); sendMessage(); }} class="mt-4 flex gap-3">
    <input
      type="text"
      bind:value={query}
      placeholder="Ask about AI tools, techniques, or your journey..."
      class="flex-1 rounded-lg bg-surface px-4 py-3 text-text shadow-sm ring-1 ring-border placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
    />
    <button
      type="submit"
      disabled={loading || !query.trim()}
      class="rounded-lg bg-primary px-6 py-3 text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
    >
      {loading ? '...' : 'Send'}
    </button>
  </form>
</div>
