<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte';
  import { api } from '$lib/api';
  import { JOB_TITLE_DESCRIPTIONS, JOB_TITLES } from '@aijourney/shared';

  let selectedTitle = $state('');
  let jobDescription = $state('');
  let searchQuery = $state('');
  let showDropdown = $state(false);
  let saving = $state(false);
  let error = $state('');

  const filteredTitles = $derived(
    searchQuery.trim()
      ? JOB_TITLES.filter(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      : JOB_TITLES
  );

  function selectTitle(title: string) {
    selectedTitle = title;
    searchQuery = title;
    jobDescription = JOB_TITLE_DESCRIPTIONS[title] ?? '';
    showDropdown = false;
  }

  function handleSearchInput() {
    selectedTitle = '';
    showDropdown = true;
  }

  function handleSearchFocus() {
    showDropdown = true;
  }

  function handleSearchBlur() {
    // Delay to allow click on dropdown item
    setTimeout(() => { showDropdown = false; }, 200);
  }

  async function handleSubmit() {
    if (!selectedTitle) {
      error = 'Please select a job title.';
      return;
    }
    if (!jobDescription.trim()) {
      error = 'Please provide a role description.';
      return;
    }

    saving = true;
    error = '';

    try {
      await api.patch(`/users/${auth.user?.userId}`, {
        jobTitle: selectedTitle,
        jobDescription: jobDescription.trim(),
        onboardingComplete: true,
      });

      // Update the auth store so the layout stops redirecting here
      if (auth.user) {
        auth.setUser({ ...auth.user, onboardingComplete: true });
      }

      goto('/');
    } catch (err: any) {
      error = err?.message || 'Failed to save. Please try again.';
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex min-h-[80vh] items-center justify-center">
  <div class="w-full max-w-lg">
    <div class="mb-8 text-center">
      <h1 class="text-3xl font-bold text-text">Welcome to Mito AI Journey</h1>
      <p class="mt-2 text-text-muted">
        Tell us about your role so we can personalize your AI experience.
      </p>
    </div>

    <div class="rounded-xl bg-surface p-8 shadow-sm ring-1 ring-border">
      <!-- Job Title Search/Select -->
      <div class="mb-6">
        <label for="job-title" class="mb-2 block text-sm font-medium text-text">
          Job Title
        </label>
        <div class="relative">
          <input
            id="job-title"
            type="text"
            bind:value={searchQuery}
            oninput={handleSearchInput}
            onfocus={handleSearchFocus}
            onblur={handleSearchBlur}
            placeholder="Search for your job title..."
            autocomplete="off"
            class="w-full rounded-lg border border-border bg-surface px-4 py-3 text-text placeholder-text-faint
              transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {#if selectedTitle}
            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-success">
              ✓
            </span>
          {/if}

          {#if showDropdown && filteredTitles.length > 0}
            <ul class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
              {#each filteredTitles as title}
                <li>
                  <button
                    type="button"
                    onmousedown={() => selectTitle(title)}
                    class="w-full cursor-pointer px-4 py-2.5 text-left text-sm text-text transition-colors
                      hover:bg-primary/10 hover:text-primary
                      {title === selectedTitle ? 'bg-primary/10 font-medium text-primary' : ''}"
                  >
                    {title}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}

          {#if showDropdown && searchQuery.trim() && filteredTitles.length === 0}
            <div class="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted shadow-lg">
              No matching job titles found. Try a different search.
            </div>
          {/if}
        </div>
      </div>

      <!-- Job Description -->
      <div class="mb-6">
        <label for="job-description" class="mb-2 block text-sm font-medium text-text">
          Role Description
        </label>
        <p class="mb-2 text-xs text-text-muted">
          This is auto-filled based on your job title. Feel free to edit it to better describe your role.
        </p>
        <textarea
          id="job-description"
          bind:value={jobDescription}
          rows={4}
          placeholder="Describe what you do in your role..."
          class="w-full resize-y rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text placeholder-text-faint
            transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        ></textarea>
      </div>

      <!-- Error message -->
      {#if error}
        <div class="mb-4 rounded-lg bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      {/if}

      <!-- Submit button -->
      <button
        onclick={handleSubmit}
        disabled={saving || !selectedTitle}
        class="w-full rounded-lg bg-primary px-6 py-3 font-medium text-white transition-colors
          hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {#if saving}
          <span class="inline-flex items-center gap-2">
            <span class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
            Saving...
          </span>
        {:else}
          Continue
        {/if}
      </button>
    </div>
  </div>
</div>
