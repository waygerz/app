/** Open the header Messages sheet on a specific conversation. */
export const OPEN_CHAT_EVENT = 'waygerz:open-chat';

export function dispatchOpenChat(conversationId: string) {
  window.dispatchEvent(
    new CustomEvent(OPEN_CHAT_EVENT, { detail: { conversationId } }),
  );
}