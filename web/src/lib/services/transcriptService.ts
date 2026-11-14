import { languageStore } from '../store/language-store';
import { get } from 'svelte/store';

export interface TranscriptResponse {
  transcript: string;
  title: string;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  #39: "'"
};

// Pure-string HTML entity decoder. Deliberately avoids assigning untrusted
// text to innerHTML (CodeQL js/xss-through-dom): entity decoding does not
// need a DOM sink.
function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+[0-9]*);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (entity.startsWith('#')) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    const named = HTML_ENTITIES[entity];
    return named !== undefined ? named : match;
  });
}

// Exact-host check instead of substring matching, so attacker-controlled
// URLs like https://youtube.com.evil.example are rejected.
function isYouTubeUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === 'youtube.com' ||
      hostname === 'www.youtube.com' ||
      hostname === 'm.youtube.com' ||
      hostname === 'music.youtube.com' ||
      hostname === 'youtu.be'
    );
  } catch {
    return false;
  }
}

export async function getTranscript(url: string): Promise<TranscriptResponse> {
  try {
    const originalLanguage = get(languageStore);
    console.log('\n=== YouTube Transcript Service Start ===');
    console.log('1. Request details:', {
      url,
      endpoint: '/api/youtube/transcript',
      method: 'POST',
      isYouTubeURL: isYouTubeUrl(url),
      originalLanguage
    });

    const response = await fetch('/api/youtube/transcript', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        language: originalLanguage // Pass original language to server
      })
    });

    console.log('2. Server response:', {
      status: response.status,
      ok: response.ok,
      type: response.type,
      originalLanguage,
      currentLanguage: get(languageStore)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }

    // Decode HTML entities in transcript
    data.transcript = decodeHtmlEntities(data.transcript);

    // Ensure language is preserved
    if (get(languageStore) !== originalLanguage) {
      console.log('3a. Restoring original language:', originalLanguage);
      languageStore.set(originalLanguage);
    }

    console.log('3b. Processed transcript:', {
      status: response.status,
      transcriptLength: data.transcript.length,
      firstChars: data.transcript.substring(0, 100),
      hasError: !!data.error,
      videoId: data.title,
      originalLanguage,
      currentLanguage: get(languageStore)
    });

    return data;
  } catch (error) {
    console.error('Transcript fetch error:', error);
    throw error instanceof Error ? error : new Error('Failed to fetch transcript');
  }
}
