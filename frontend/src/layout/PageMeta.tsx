import { createContext, useContext, useEffect } from 'react';

export interface PageMeta {
  title: string;
  demoBadge?: boolean;
  newConversation?: boolean;
}

const PageMetaContext = createContext<(m: PageMeta) => void>(() => undefined);

export const PageMetaProvider = PageMetaContext.Provider;

/** Pages call this to drive the shared Topbar (title, badges, actions). */
export function usePageMeta(title: string, opts?: { demoBadge?: boolean; newConversation?: boolean }) {
  const setMeta = useContext(PageMetaContext);
  const demoBadge = opts?.demoBadge;
  const newConversation = opts?.newConversation;
  useEffect(() => {
    setMeta({ title, demoBadge, newConversation });
  }, [setMeta, title, demoBadge, newConversation]);
}
