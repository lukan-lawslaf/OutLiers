import type { ReactNode } from 'react';
import { LoaderCircle, Paperclip } from 'lucide-react';

export function Spinner() { return <LoaderCircle className="spin" size={16} aria-hidden="true" />; }
export function EmptyNote({ children }: { children: ReactNode }) { return <div className="empty-note"><Paperclip size={22} /><p>{children}</p></div>; }
