/** Shared spring used for exits — tighter than entrance springs so dismissal reads snappier. */
export const EXIT_SPRING = { type: "spring", stiffness: 500, damping: 40 } as const;
