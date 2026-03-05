<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';

  const API_BASE = import.meta.env.VITE_API_URL || '/api';

  // ─── State ─────────────────────────────────────────────────────

  let loading = $state(true);
  let error = $state('');
  let successMessage = $state('');

  // Free-text
  let freeText = $state('');
  let savedFreeText = $state('');
  let savingText = $state(false);

  // Documents
  interface CompanyFact {
    id: string;
    category: string;
    fact: string;
  }
  interface CompanyDocument {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    extractionStatus: 'pending' | 'processing' | 'completed' | 'failed';
    extractedFacts: CompanyFact[];
    extractionError?: string;
    lastExtractedAt?: string;
    createdAt: string;
  }

  let documents = $state<CompanyDocument[]>([]);
  let uploading = $state(false);
  let expandedDocId = $state<string | null>(null);

  // Drag state
  let dragOver = $state(false);

  const hasTextChanges = $derived(freeText !== savedFreeText);

  // ─── API Helpers ───────────────────────────────────────────────

  function headers(): Record<string, string> {
    return { Authorization: `Bearer ${auth.user?.token}` };
  }

  function jsonHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${auth.user?.token}`,
      'Content-Type': 'application/json',
    };
  }

  // ─── Load Data ─────────────────────────────────────────────────

  async function loadState() {
    loading = true;
    error = '';
    try {
      const res = await fetch(`${API_BASE}/company-context`, { headers: headers() });
      if (!res.ok) throw new Error('Failed to load company context');
      const json = await res.json();
      if (json.data) {
        freeText = json.data.freeText || '';
        savedFreeText = json.data.freeText || '';
        documents = json.data.documents || [];
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load';
    } finally {
      loading = false;
    }
  }

  // ─── Free Text ─────────────────────────────────────────────────

  async function saveText() {
    savingText = true;
    error = '';
    try {
      const res = await fetch(`${API_BASE}/company-context/text`, {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify({ text: freeText }),
      });
      if (!res.ok) throw new Error('Failed to save text');
      savedFreeText = freeText;
      flash('Company description saved');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Save failed';
    } finally {
      savingText = false;
    }
  }

  // ─── Document Upload ──────────────────────────────────────────

  async function uploadFile(file: File) {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
    ];
    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.md')) {
      error = 'Unsupported file type. Allowed: PDF, DOCX, TXT, MD';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      error = 'File too large. Maximum 10 MB.';
      return;
    }
    if (documents.length >= 20) {
      error = 'Maximum 20 documents per organization.';
      return;
    }

    uploading = true;
    error = '';
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/company-context/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.user?.token}` },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error?.message || 'Upload failed');
      }
      documents = [json.data, ...documents];
      flash('Document uploaded — extraction in progress');
      // Poll for extraction completion
      pollDocument(json.data.id);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Upload failed';
    } finally {
      uploading = false;
    }
  }

  function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) {
      uploadFile(input.files[0]);
      input.value = '';
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files?.[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  // ─── Document Actions ─────────────────────────────────────────

  async function deleteDocument(docId: string) {
    if (!confirm('Delete this document and its extracted facts?')) return;
    error = '';
    try {
      const res = await fetch(`${API_BASE}/company-context/documents/${docId}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) throw new Error('Delete failed');
      documents = documents.filter((d) => d.id !== docId);
      flash('Document deleted');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Delete failed';
    }
  }

  async function reExtract(docId: string) {
    error = '';
    try {
      const res = await fetch(`${API_BASE}/company-context/documents/${docId}/re-extract`, {
        method: 'POST',
        headers: headers(),
      });
      if (!res.ok) throw new Error('Re-extraction failed');
      // Update local status
      documents = documents.map((d) =>
        d.id === docId ? { ...d, extractionStatus: 'processing' as const, extractedFacts: [] } : d
      );
      flash('Re-extraction started');
      pollDocument(docId);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Re-extraction failed';
    }
  }

  // ─── Polling ──────────────────────────────────────────────────

  function pollDocument(docId: string) {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 30) {
        clearInterval(interval);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/company-context`, { headers: headers() });
        if (!res.ok) return;
        const json = await res.json();
        if (json.data?.documents) {
          const updated = json.data.documents.find((d: CompanyDocument) => d.id === docId);
          if (updated && (updated.extractionStatus === 'completed' || updated.extractionStatus === 'failed')) {
            documents = json.data.documents;
            clearInterval(interval);
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
  }

  // ─── Helpers ──────────────────────────────────────────────────

  function flash(msg: string) {
    successMessage = msg;
    setTimeout(() => {
      successMessage = '';
    }, 3000);
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fileTypeLabel(mime: string): string {
    if (mime === 'application/pdf') return 'PDF';
    if (mime.includes('wordprocessingml')) return 'DOCX';
    if (mime === 'text/plain') return 'TXT';
    if (mime === 'text/markdown') return 'MD';
    return mime.split('/').pop() || 'File';
  }

  function statusBadge(status: string): { text: string; cls: string } {
    switch (status) {
      case 'completed':
        return { text: 'Extracted', cls: 'bg-green-500/10 text-green-400' };
      case 'processing':
        return { text: 'Processing…', cls: 'bg-yellow-500/10 text-yellow-400' };
      case 'pending':
        return { text: 'Pending', cls: 'bg-blue-500/10 text-blue-400' };
      case 'failed':
        return { text: 'Failed', cls: 'bg-red-500/10 text-red-400' };
      default:
        return { text: status, cls: 'bg-gray-500/10 text-gray-400' };
    }
  }

  function toggleExpand(docId: string) {
    expandedDocId = expandedDocId === docId ? null : docId;
  }

  const totalFacts = $derived(documents.reduce((sum, d) => sum + (d.extractedFacts?.length || 0), 0));

  // ─── Init ─────────────────────────────────────────────────────

  $effect(() => {
    if (auth.user?.token) {
      loadState();
    }
  });
</script>

<div class="space-y-6">
  <!-- Success Toast -->
  {#if successMessage}
    <div class="rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-400">
      {successMessage}
    </div>
  {/if}

  <!-- Error -->
  {#if error}
    <div class="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
      {error}
      <button onclick={() => (error = '')} class="ml-2 underline hover:no-underline">dismiss</button>
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
    </div>
  {:else}
    <!-- Stats -->
    <div class="grid grid-cols-3 gap-4">
      <div class="rounded-lg bg-surface p-4">
        <p class="text-xs font-medium uppercase text-text-muted">Documents</p>
        <p class="mt-1 text-2xl font-bold text-text">{documents.length}<span class="text-sm font-normal text-text-muted">/20</span></p>
      </div>
      <div class="rounded-lg bg-surface p-4">
        <p class="text-xs font-medium uppercase text-text-muted">Extracted Facts</p>
        <p class="mt-1 text-2xl font-bold text-text">{totalFacts}</p>
      </div>
      <div class="rounded-lg bg-surface p-4">
        <p class="text-xs font-medium uppercase text-text-muted">Free Text</p>
        <p class="mt-1 text-2xl font-bold text-text">{freeText.length > 0 ? '✓' : '—'}</p>
      </div>
    </div>

    <!-- Section 1: Free-Text Company Description -->
    <div class="rounded-lg border border-border bg-surface">
      <div class="border-b border-border px-6 py-4">
        <h2 class="text-lg font-semibold text-text">Company Description</h2>
        <p class="mt-1 text-sm text-text-muted">
          Describe your company, industry, products, and culture. This context is injected into all AI
          interactions to provide more relevant, company-specific responses.
        </p>
      </div>
      <div class="p-6">
        <textarea
          bind:value={freeText}
          rows="8"
          placeholder="e.g. We are a fintech company of ~200 employees based in Budapest. We build mobile banking solutions for retail customers in the EU. Our main product is SuperBank, a white-label mobile banking app. We use agile methodology with 2-week sprints..."
          class="w-full rounded-lg border border-border bg-surface-dark px-4 py-3 text-sm text-text placeholder-text-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        ></textarea>
        <div class="mt-3 flex items-center justify-between">
          <p class="text-xs text-text-muted">{freeText.length} characters</p>
          <button
            onclick={saveText}
            disabled={savingText || !hasTextChanges}
            class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingText ? 'Saving…' : hasTextChanges ? 'Save Changes' : 'Saved'}
          </button>
        </div>
      </div>
    </div>

    <!-- Section 2: Document Upload & Management -->
    <div class="rounded-lg border border-border bg-surface">
      <div class="border-b border-border px-6 py-4">
        <h2 class="text-lg font-semibold text-text">Company Documents</h2>
        <p class="mt-1 text-sm text-text-muted">
          Upload documents (PDF, DOCX, TXT, MD) with company information. Facts are automatically
          extracted and used to enrich AI responses.
        </p>
      </div>
      <div class="p-6 space-y-4">
        <!-- Drop Zone -->
        <div
          role="button"
          tabindex="0"
          ondrop={handleDrop}
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          onkeydown={(e) => { if (e.key === 'Enter') document.getElementById('file-input')?.click(); }}
          onclick={() => document.getElementById('file-input')?.click()}
          class="relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors
            {dragOver
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-surface-dark'}"
        >
          {#if uploading}
            <div class="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
            <p class="mt-3 text-sm text-text-muted">Uploading…</p>
          {:else}
            <span class="text-3xl">📄</span>
            <p class="mt-3 text-sm font-medium text-text">
              Drop a file here or <span class="text-primary underline">browse</span>
            </p>
            <p class="mt-1 text-xs text-text-muted">PDF, DOCX, TXT, or Markdown — max 10 MB</p>
          {/if}
          <input
            id="file-input"
            type="file"
            accept=".pdf,.docx,.doc,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            onchange={handleFileInput}
            class="hidden"
          />
        </div>

        <!-- Document List -->
        {#if documents.length > 0}
          <div class="space-y-2">
            {#each documents as doc (doc.id)}
              {@const badge = statusBadge(doc.extractionStatus)}
              <div class="rounded-lg border border-border bg-surface-dark">
                <!-- Document Row -->
                <div class="flex items-center gap-3 px-4 py-3">
                  <!-- File icon -->
                  <span class="text-lg" title={fileTypeLabel(doc.mimeType)}>
                    {#if doc.mimeType === 'application/pdf'}📕{:else if doc.mimeType.includes('wordprocessingml')}📘{:else}📄{/if}
                  </span>
                  <!-- Name + meta -->
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-text">{doc.originalName}</p>
                    <p class="text-xs text-text-muted">
                      {fileTypeLabel(doc.mimeType)} · {formatSize(doc.sizeBytes)}
                      {#if doc.extractedFacts?.length}
                        · {doc.extractedFacts.length} fact{doc.extractedFacts.length !== 1 ? 's' : ''}
                      {/if}
                    </p>
                  </div>
                  <!-- Status badge -->
                  <span class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium {badge.cls}">
                    {badge.text}
                  </span>
                  <!-- Actions -->
                  <div class="flex shrink-0 items-center gap-1">
                    {#if doc.extractedFacts?.length}
                      <button
                        onclick={() => toggleExpand(doc.id)}
                        title="View extracted facts"
                        class="rounded p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-text"
                      >
                        {expandedDocId === doc.id ? '▼' : '▶'}
                      </button>
                    {/if}
                    <button
                      onclick={() => reExtract(doc.id)}
                      title="Re-extract facts"
                      disabled={doc.extractionStatus === 'processing'}
                      class="rounded p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-30"
                    >
                      🔄
                    </button>
                    <button
                      onclick={() => deleteDocument(doc.id)}
                      title="Delete document"
                      class="rounded p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-red-400"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <!-- Extraction Error -->
                {#if doc.extractionStatus === 'failed' && doc.extractionError}
                  <div class="border-t border-border px-4 py-2">
                    <p class="text-xs text-red-400">Error: {doc.extractionError}</p>
                  </div>
                {/if}

                <!-- Expanded Facts -->
                {#if expandedDocId === doc.id && doc.extractedFacts?.length}
                  <div class="border-t border-border px-4 py-3">
                    <p class="mb-2 text-xs font-semibold uppercase text-text-muted">Extracted Facts</p>
                    <div class="space-y-1.5">
                      {#each doc.extractedFacts as fact}
                        <div class="flex gap-2 text-xs">
                          <span class="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                            {fact.category}
                          </span>
                          <span class="text-text">{fact.fact}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <div class="rounded-lg border border-border bg-surface-dark px-4 py-8 text-center">
            <p class="text-sm text-text-muted">No documents uploaded yet</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Info box -->
    <div class="rounded-lg border border-primary/20 bg-primary/5 px-6 py-4">
      <h3 class="text-sm font-semibold text-primary">How it works</h3>
      <ul class="mt-2 space-y-1 text-xs text-text-muted">
        <li>• The <strong class="text-text">company description</strong> and <strong class="text-text">extracted document facts</strong> are injected into every AI interaction.</li>
        <li>• AI Chat, Planner, Prompt Optimizer, and Article Recommendations all use this context.</li>
        <li>• Facts are automatically extracted when you upload documents. You can re-extract if needed.</li>
        <li>• Changes take effect within 5 minutes (cached).</li>
      </ul>
    </div>
  {/if}
</div>
