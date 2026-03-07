<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth.svelte';
  import { marked } from 'marked';
  import { tick } from 'svelte';

  marked.setOptions({ breaks: true, gfm: true });
  function renderMarkdown(content: string): string {
    return marked.parse(content) as string;
  }

  interface ChatSource { title: string; url: string; relevance: string }
  interface ChatResponseData {
    answer: string;
    sources: ChatSource[];
    tokensUsed: number;
    model: string;
    technicalSteps?: string[];
  }
  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    sources?: ChatSource[];
    model?: string;
    tokensUsed?: number;
    technicalSteps?: string[];
    isError?: boolean;
  }

  let query = $state('');
  let messages = $state<ChatMessage[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let messagesEnd: HTMLDivElement;
  let textareaEl: HTMLTextAreaElement;

  $effect(() => {
    if (!auth.loading && auth.user && auth.user.globalRole !== 'superadmin') {
      goto('/', { replaceState: true });
    }
  });

  function getConversationHistory(): { role: 'user' | 'assistant'; content: string }[] {
    return messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
  }

  async function scrollToBottom() {
    await tick();
    messagesEnd?.scrollIntoView({ behavior: 'smooth' });
  }

  function autoResize() {
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + 'px';
    }
  }

  async function sendMessage() {
    if (!query.trim() || loading) return;
    const userMessage = query.trim();
    messages = [...messages, { role: 'user', content: userMessage }];
    query = '';
    if (textareaEl) textareaEl.style.height = 'auto';
    loading = true;
    error = null;
    scrollToBottom();

    try {
      const history = getConversationHistory().slice(0, -1);
      const res = await api.post<ChatResponseData>('/chat', {
        query: userMessage,
        history,
        userId: auth.user?.userId,
      });
      if (res.error) throw new Error(res.error.message);
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
            technicalSteps: chatData.technicalSteps,
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
      scrollToBottom();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const suggestions = [
    'What AI tools should I try first?',
    'Best practices for prompt engineering',
    'How to integrate AI into my workflow?',
    'Explain RAG in simple terms',
  ];
</script>

<div class="flex h-[calc(100vh-6rem)] flex-col">
  <!-- Messages area -->
  <div class="flex-1 overflow-y-auto">
    {#if messages.length === 0}
      <!-- Empty state — centered like ChatGPT -->
      <div class="flex h-full flex-col items-center justify-center px-4">
        <div class="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <svg class="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
          </svg>
        </div>
        <h1 class="mb-2 text-2xl font-semibold text-text">AI Knowledge Chat</h1>
        <p class="mb-8 text-sm text-text-faint">Powered by your organization's curated AI knowledge base</p>
        <div class="grid w-full max-w-2xl grid-cols-2 gap-3">
          {#each suggestions as suggestion}
            <button
              onclick={() => { query = suggestion; textareaEl?.focus(); }}
              class="rounded-xl border border-border px-4 py-3 text-left text-sm text-text-muted transition-colors hover:bg-surface-darker"
            >
              {suggestion}
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <!-- Conversation -->
      <div class="mx-auto max-w-3xl px-4 py-4">
        {#each messages as msg}
          {#if msg.role === 'user'}
            <!-- User message — right-aligned bubble -->
            <div class="mb-6 flex justify-end">
              <div class="max-w-[85%] rounded-3xl bg-surface-darker px-5 py-3 text-text">
                <p class="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</p>
              </div>
            </div>
          {:else}
            <!-- Assistant message — full width, no bubble -->
            <div class="group mb-6">
              <div class="flex items-start gap-3">
                <!-- AI icon -->
                <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <svg class="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                  </svg>
                </div>
                <!-- Content -->
                <div class="min-w-0 flex-1">
                  <div
                    class="prose prose-sm max-w-none
                      prose-headings:font-semibold prose-headings:text-text
                      prose-p:text-[15px] prose-p:leading-relaxed prose-p:text-text
                      prose-strong:text-text
                      prose-li:text-[15px] prose-li:text-text
                      prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                      prose-code:rounded prose-code:bg-surface-darker prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-normal prose-code:text-text-muted prose-code:before:content-[''] prose-code:after:content-['']
                      prose-pre:rounded-xl prose-pre:bg-[#1e1e1e] prose-pre:text-[13px]
                      {msg.isError ? 'text-red-600' : ''}"
                  >
                    {@html renderMarkdown(msg.content)}
                  </div>

                  <!-- Sources -->
                  {#if msg.sources && msg.sources.length > 0}
                    <div class="mt-4 flex flex-wrap gap-2">
                      {#each msg.sources as source, i}
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-primary/40 hover:text-primary"
                          title={source.relevance}
                        >
                          <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface-darker text-[10px] font-medium text-text-faint">{i + 1}</span>
                          <span class="max-w-[180px] truncate">{source.title}</span>
                        </a>
                      {/each}
                    </div>
                  {/if}

                  <!-- Action row (model, tokens, technical steps) — visible on hover like ChatGPT -->
                  {#if msg.model || (msg.technicalSteps && msg.technicalSteps.length > 0)}
                    <div class="mt-2 flex items-center gap-3 text-xs text-text-faint opacity-0 transition-opacity group-hover:opacity-100">
                      {#if msg.model}
                        <span>{msg.model}</span>
                      {/if}
                      {#if msg.tokensUsed}
                        <span>{msg.tokensUsed.toLocaleString()} tokens</span>
                      {/if}
                    </div>
                  {/if}

                  <!-- Technical Steps (collapsible) -->
                  {#if msg.technicalSteps && msg.technicalSteps.length > 0}
                    <details class="mt-3">
                      <summary class="cursor-pointer select-none text-xs font-medium text-text-faint transition-colors hover:text-text-muted">
                        Technical Steps ({msg.technicalSteps.length})
                      </summary>
                      <ol class="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-text-faint">
                        {#each msg.technicalSteps as step}
                          <li>{step}</li>
                        {/each}
                      </ol>
                    </details>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        {/each}

        <!-- Loading indicator — bouncing dots like ChatGPT -->
        {#if loading}
          <div class="mb-6 flex items-start gap-3">
            <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <svg class="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
              </svg>
            </div>
            <div class="flex items-center gap-1 pt-2.5">
              <span class="h-2 w-2 animate-[bounce_1.4s_ease-in-out_infinite] rounded-full bg-text-faint"></span>
              <span class="h-2 w-2 animate-[bounce_1.4s_ease-in-out_0.2s_infinite] rounded-full bg-text-faint"></span>
              <span class="h-2 w-2 animate-[bounce_1.4s_ease-in-out_0.4s_infinite] rounded-full bg-text-faint"></span>
            </div>
          </div>
        {/if}
        <div bind:this={messagesEnd}></div>
      </div>
    {/if}
  </div>

  <!-- Input area — bottom bar like ChatGPT -->
  <div class="mx-auto w-full max-w-3xl px-4 pb-4 pt-2">
    {#if error}
      <div class="mb-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
        {error}
      </div>
    {/if}
    <form
      onsubmit={(e) => { e.preventDefault(); sendMessage(); }}
      class="relative flex items-end rounded-2xl border border-border bg-surface shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-1 focus-within:ring-primary/30"
    >
      <textarea
        bind:this={textareaEl}
        bind:value={query}
        onkeydown={handleKeydown}
        oninput={autoResize}
        placeholder="Message AI Knowledge Chat..."
        rows="1"
        class="max-h-[200px] min-h-[52px] flex-1 resize-none bg-transparent px-4 py-3.5 text-[15px] text-text placeholder:text-text-faint focus:outline-none"
      ></textarea>
      <button
        type="submit"
        disabled={loading || !query.trim()}
        class="mb-2 mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-text text-surface transition-colors hover:bg-text-muted disabled:bg-border disabled:text-surface"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
        </svg>
      </button>
    </form>
    <p class="mt-2 text-center text-[11px] text-text-faint">
      AI can make mistakes. Answers come from your organization's knowledge base.
    </p>
  </div>
</div>
