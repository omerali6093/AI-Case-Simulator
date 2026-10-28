import Groq from 'groq-sdk';

let _client: Groq | null = null;

/**
 * Returns a shared Groq SDK instance.
 * Throws clearly if the key is missing rather than failing silently at request time.
 */
export function getGroqClient(apiKey: string): Groq {
  if (!_client) {
    _client = new Groq({ apiKey });
  }
  return _client;
}
