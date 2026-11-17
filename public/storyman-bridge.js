/* Connects the preserved single-file Story Card editor to Storyman's owner-only API. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { jobId: new URLSearchParams(location.search).get('jobId'), job: null, cards: [], stale: false };
  const tell = (message, error = false) => { const element = $('composerStatus'); element.textContent = message; element.classList.toggle('error', error); };
  const request = async (url, method = 'GET', body, signal) => {
    const response = await fetch(url, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `${method} ${url} failed (${response.status}).`);
    return payload;
  };
  const pause = (ms, signal) => new Promise((resolve, reject) => { const timer = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Generation cancelled.')); }, { once: true }); });
  function render(cards) {
    state.cards = cards;
    if (!cards.length) return;
    window.storyCards.replaceScripts(cards.map(card => card.narration_text));
    const nodes = [...document.querySelectorAll('.story-card')];
    nodes.forEach((node, index) => {
      const card = cards[index]; node.dataset.sceneId = card.scene_id;
      node.querySelector('.duplicate').title = 'Duplicate two-sentence scene';
      const toolbar = document.createElement('div'); toolbar.className = 'card-workflow';
      const visual = document.createElement('input'); visual.placeholder = 'Canva search terms (comma separated)'; visual.value = card.canva_search_terms.join(', '); visual.setAttribute('aria-label', 'Canva visual search terms');
      const sfx = document.createElement('input'); sfx.placeholder = 'Sound effect brief'; sfx.value = card.sfx_prompt; sfx.setAttribute('aria-label', 'Sound effect brief');
      const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Save scene';
      const narrate = document.createElement('button'); narrate.type = 'button'; narrate.textContent = 'Generate ZONOS3 audio';
      const findDesigns = document.createElement('button'); findDesigns.type = 'button'; findDesigns.textContent = 'Find Canva designs';
      const designSelect = document.createElement('select'); designSelect.setAttribute('aria-label', 'Accessible Canva design'); designSelect.hidden = true;
      const designFormat = document.createElement('select'); designFormat.setAttribute('aria-label', 'Canva export format'); designFormat.hidden = true;
      for(const format of ['png','mp4']){const option=document.createElement('option');option.value=format;option.textContent=format.toUpperCase();designFormat.append(option);}
      const useDesign = document.createElement('button'); useDesign.type = 'button'; useDesign.textContent = 'Export design to scene'; useDesign.hidden = true;
      const meta = document.createElement('small'); meta.textContent = `Scene ${card.ordinal} · ${card.tts_status}${card.tts_duration_ms ? ` · ${(card.tts_duration_ms / 1000).toFixed(1)}s` : ''}${card.error_message ? ` · ${card.error_message}` : ''}`;
      const connectCanva=document.createElement('a');connectCanva.href='/?view=connections';connectCanva.textContent='Canva connection';connectCanva.style.cssText='padding:8px;color:#ffad76';
      toolbar.append(visual, sfx, save, narrate, findDesigns, designSelect, designFormat, useDesign, connectCanva, meta); node.querySelector('.editor').append(toolbar);
      if(state.stale){save.disabled=true;narrate.disabled=true;findDesigns.disabled=true;meta.textContent='These cards are stale. Rebuild from the full script before editing.';}
      node.querySelector('.script-input').addEventListener('input',()=>{if(card.tts_audio_path){window.storyCards.stop();node.querySelector('.tts-section .transport').disabled=true;meta.textContent='Unsaved script edit · saved narration no longer matches';} });
      save.addEventListener('click', async () => {
        save.disabled = true;
        try {
          const data = await request(`/api/jobs/${state.jobId}/cards/${card.scene_id}`, 'PATCH', { revision: card.revision, narration_text: node.querySelector('.script-input').value, sfx_prompt: sfx.value, canva_search_terms: visual.value.split(',').map(x => x.trim()).filter(Boolean) });
          state.cards[index] = data.card; render(state.cards); tell(`Scene ${card.ordinal} saved. ${data.card.tts_status === 'pending' ? 'Generate fresh narration for this script.' : 'Existing narration is preserved.'}`);
        } catch (error) { tell(error.message, true); } finally { save.disabled = false; }
      });
      narrate.addEventListener('click', async () => {
        narrate.disabled = true; tell(`Generating ZONOS3-Mini narration for scene ${card.ordinal}…`);
        try {
          const data = await request(`/api/jobs/${state.jobId}/cards/${card.scene_id}/narrate`, 'POST');
          state.cards[index] = data.card; render(state.cards);
          tell(data.card.error_message ? `Audio is ready; word alignment needs review: ${data.card.error_message}` : `Scene ${card.ordinal} audio and word alignment are ready.`, Boolean(data.card.error_message));
        } catch (error) { tell(error.message, true); } finally { narrate.disabled = false; }
      });
      findDesigns.addEventListener('click', async () => {
        findDesigns.disabled = true;
        try {
          const query = visual.value.split(',')[0].trim();
          const data = await request(`/api/canva/designs?query=${encodeURIComponent(query)}`);
          designSelect.replaceChildren();
          for (const design of data.items) { const option = document.createElement('option'); option.value = design.id; option.textContent = design.title || design.id; designSelect.append(option); }
          if (!data.items.length) throw new Error('No accessible Canva designs match these terms. Upload or create a design in Canva, then search again.');
          designSelect.hidden = false; designFormat.hidden = false; useDesign.hidden = false;
          tell(`${data.items.length} owned or shared Canva designs found. Choose one to export; built-in stock search is unavailable.`);
        } catch (error) { tell(error.message, true); } finally { findDesigns.disabled = false; }
      });
      useDesign.addEventListener('click', async () => {
        useDesign.disabled = true; tell(`Exporting the selected Canva design for scene ${card.ordinal}…`);
        try {
          const data = await request(`/api/jobs/${state.jobId}/cards/${card.scene_id}/canva`, 'POST', { design_id: designSelect.value, format: designFormat.value });
          state.cards[index] = data.card; render(state.cards); tell(`Canva export saved for scene ${card.ordinal}. Review design content and publishing rights before rendering.`);
        } catch (error) { tell(error.message, true); } finally { useDesign.disabled = false; }
      });
      if (card.tts_audio_path) window.storyCards.bindAudio(node, { ttsUrl: new URL(card.tts_audio_path, location.href).href });
      if (card.visual_path) {
        const preview = node.querySelector('.video-placeholder');
        const media = document.createElement(card.canva_asset_type === 'video' ? 'video' : 'img'); media.src = card.visual_path; media.style.cssText = 'width:100%;height:100%;object-fit:cover';
        if (media.tagName === 'VIDEO') { media.controls = true; media.preload = 'metadata'; }
        preview.replaceChildren(media);
      }
    });
  }
  async function loadJob(id) {
    const data = await request(`/api/jobs/${encodeURIComponent(id)}/cards`);
    state.jobId = id; state.job = data.job; state.stale = data.stale;
    $('storyPrompt').value = data.job.prompt; $('storyLanguage').value = data.job.language;
    $('storyDuration').value = String(data.job.duration); $('storyAudience').value = data.job.audience || ''; $('fullScript').value = data.job.script || data.job.scriptDraft || '';
    $('generatedTitle').textContent = data.job.title; $('scriptOutput').hidden = false;
    if (data.cards.length) { render(data.cards); tell(data.stale ? 'Cards are stale after a full-script edit. Rebuild them before saving a scene.' : `Loaded ${data.cards.length} saved story cards.` ,data.stale); }
    else tell(data.job.script ? 'Script loaded. Build its exact two-sentence cards.' : data.job.blocker || 'The story is still processing.', Boolean(data.job.blocker));
  }
  async function saveFullScript(script) {
    if (!state.jobId || !state.job) throw new Error('Generate a researched story before saving scenes to Storyman. Local drafts can be exported as JSON.');
    const data = await request(`/api/jobs/${state.jobId}/script`, 'PUT', { title: state.job.title, script, claims: state.job.claims || [], editorialApproved: false });
    state.job = data.job;
    return data.job;
  }
  window.storyComposer.configure({ generator: async (payload, { signal }) => {
    if (!payload.research) throw new Error('Fiction-only generation is not configured. Enable factual research or paste your own script.');
    const model = $('zenModel').value;
    if (!model) throw new Error('Choose an available OpenCode Zen free model first.');
    const created = await request('/api/stories/generate', 'POST', { prompt: payload.prompt, genre: payload.format || 'Inspirational Real Story', storyFormat: payload.format, tone: payload.tone, audience: payload.intendedViewer, language: payload.language, duration: payload.targetDurationSeconds, voice: 'natural', platforms: ['youtube', 'facebook', 'tiktok'], model, idempotencyKey: crypto.randomUUID() }, signal);
    state.jobId = created.job.id; history.replaceState(null, '', `/story-card.html?jobId=${encodeURIComponent(state.jobId)}`);
    for (let i = 0; i < 240; i++) {
      await pause(2000, signal);
      const { job } = await request(`/api/jobs/${state.jobId}`, 'GET', undefined, signal);
      state.job = job;
      if (job.script && job.status === 'NEEDS_REVIEW') {
        let built;
        for(let attempt=0;attempt<5;attempt++){
          try{built=await request(`/api/jobs/${state.jobId}/cards`, 'POST', undefined, signal);break;}
          catch(error){if(!/active lease/i.test(error.message)||attempt===4)throw error;await pause(1000,signal);}
        }
        state.stale=false;
        setTimeout(() => render(built.cards), 0);
        return { title: job.title, script: job.script, researchPerformed: true, sources: job.sources.map(source => ({ title: source.title, url: source.url, publisher: new URL(source.url).hostname })) };
      }
      if (['BLOCKED_AUTH', 'NEEDS_RESEARCH', 'FAILED', 'CANVA_CAPABILITY_MISSING'].includes(job.status) || job.blocker && !['NEEDS_REVIEW', 'RESEARCHING', 'SCRIPTED', 'QUEUED'].includes(job.status)) throw new Error(job.blocker || `Generation stopped at ${job.status}.`);
      if (job.status === 'NEEDS_REVIEW' && !job.script) throw new Error(job.blocker || 'The writer did not return an approved script. Inspect the job activity.');
    }
    throw new Error('Story generation is still running. Reopen this job from the Storyman dashboard.');
  } });
  $('buildCards').addEventListener('click', async event => {
    if (!state.jobId) return;
    event.stopImmediatePropagation();
    const button = event.currentTarget; button.disabled = true;
    try {
      const script = $('fullScript').value.trim();
      window.storyComposer.chunkScript(script); // Reject odd or incomplete scripts before saving.
      if (script !== state.job.script) await saveFullScript(script);
      const built = await request(`/api/jobs/${state.jobId}/cards`, 'POST'); state.stale=false; render(built.cards); tell(`${built.cards.length} two-sentence cards saved.`);
    } catch (error) { tell(error.message, true); } finally { button.disabled = false; }
  }, true);
  document.querySelector('.cards').addEventListener('click', async event => {
    const duplicate = event.target.closest('.duplicate'); if (!duplicate || !state.jobId) return;
    event.stopImmediatePropagation();
    const node = duplicate.closest('.story-card'); const index = [...document.querySelectorAll('.story-card')].indexOf(node);
    if (index < 0 || !state.cards[index]) return;
    try {
      const next = state.cards.map(card => card.narration_text); next.splice(index + 1, 0, state.cards[index].narration_text);
      const script = next.join(' '); await saveFullScript(script); const built = await request(`/api/jobs/${state.jobId}/cards`, 'POST'); state.stale=false; $('fullScript').value = script; render(built.cards); tell('Duplicated the two-sentence scene with a new scene ID.');
    } catch (error) { tell(error.message, true); }
  }, true);
  $('saveJson').addEventListener('click', () => {
    const data = state.jobId ? { schema_version: 1, job: state.job, cards: state.cards } : { schema_version: 1, draft: { prompt: $('storyPrompt').value, script: $('fullScript').value, audience: $('storyAudience').value } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `storyman-${state.jobId || 'draft'}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('importJson').addEventListener('change', async event => {
    const file = event.currentTarget.files[0]; if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Import JSON must be under 1 MB.');
      const parsed = JSON.parse(await file.text());
      if (parsed.schema_version !== 1) throw new Error('Unsupported Storyman JSON version.');
      const draft = parsed.draft || parsed.job;
      if (typeof draft?.script !== 'string' || typeof draft?.prompt !== 'string') throw new Error('JSON needs a prompt and full script.');
      window.storyComposer.chunkScript(draft.script); // Validate before replacing the visible draft.
      state.jobId = null; state.job = null; state.cards = []; history.replaceState(null, '', '/story-card.html');
      $('storyPrompt').value = draft.prompt; $('storyAudience').value = draft.audience || ''; $('fullScript').value = draft.script; $('scriptOutput').hidden = false;
      window.storyCards.replaceScripts(window.storyComposer.chunkScript(draft.script).chunks);
      localStorage.setItem('storyman-card-draft',JSON.stringify({prompt:draft.prompt,script:draft.script,audience:draft.audience||''}));
      tell('JSON imported as a local draft. Generate a sourced Storyman job to persist it on the server.');
    } catch (error) { tell(error.message, true); } finally { event.currentTarget.value = ''; }
  });
  request('/api/models').then(data => {
    const select = $('zenModel'); select.replaceChildren();
    for (const model of data.models) { const option = document.createElement('option'); option.value = model; option.textContent = model; select.append(option); }
    if (data.selectedModel && data.models.includes(data.selectedModel)) select.value = data.selectedModel;
    $('zenStatus').textContent = `${data.models.length} current free models · quota checked on generation`;
  }).catch(error => { $('zenStatus').textContent = error.message; tell(error.message, true); });
  if (state.jobId) loadJob(state.jobId).catch(error => tell(error.message, true));
  else {
    const draft = localStorage.getItem('storyman-card-draft');
    if (draft) try { const data = JSON.parse(draft); $('storyPrompt').value = data.prompt || ''; $('storyAudience').value = data.audience || ''; $('fullScript').value = data.script || ''; if (data.script) $('scriptOutput').hidden = false; if(Array.isArray(data.cards)&&data.cards.length&&data.cards.length<=120&&data.cards.every(x=>typeof x==='string'&&x.trim()))window.storyCards.replaceScripts(data.cards); } catch {}
  }
  const saveDraft = () => { if (!state.jobId) localStorage.setItem('storyman-card-draft', JSON.stringify({ prompt: $('storyPrompt').value, script: $('fullScript').value, audience: $('storyAudience').value, cards:[...document.querySelectorAll('.cards .script-input')].map(x=>x.value) })); };
  $('storyPrompt').addEventListener('input', saveDraft); $('storyAudience').addEventListener('input', saveDraft); $('fullScript').addEventListener('input', saveDraft);
  $('buildCards').addEventListener('click', saveDraft);
  document.querySelector('.cards').addEventListener('input', saveDraft);
  document.querySelector('.cards').addEventListener('click', saveDraft);
})();
