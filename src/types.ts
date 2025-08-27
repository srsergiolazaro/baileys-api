import type { WASocket } from "baileys";
import type { Store } from "./store";

export type Session = WASocket & {
	destroy: () => Promise<void>;
	store: Store;
};
