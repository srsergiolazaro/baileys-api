import type { WASocket } from "baileys";
import type { Store } from "./store";

export type Session = WASocket & {
	destroy: (logout?: boolean) => Promise<void>;
	store: Store;
	sseResponse?: any;
	SSE?: boolean;
};
