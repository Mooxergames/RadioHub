# Mobile mini player logo glow and failure

Figma Others / alt417:2470 reviewed visually in browser; design-context request blocked by Starter MCP quota. Retained71px row,50px/radius5 logo and40px controls. Existing Figma shadow reference recorded in asset SOURCE.md is0,14,29,-17 fixed#9779F8; current user-approved runtime adaptation samples the artwork and uses a color-only radial halo with16%/7%/0% alpha. Sampling is cached64 URLs and decodes32x32; no new request/probe loop was introduced. The halo is now positioned relative to the artwork slot, including compact36px and floating variants, rather than hardcoded row coordinates.

Failure keeps station name and a single localized subtitle (Turkish: Yayın açılamadı), existing broadcast SVG24px in a square logo slot, retry/play and close. No Opss heading or two-line paragraph. All14 languages covered. Shared MiniPlayer means docked/global/chat variants share the correction. Size and playback lifecycle unchanged.

Validation: presentation geometry/localization test passed, no new TypeScript diagnostics. Mobile failure screenshot output/mini-player-compact/error-mobile.png. Dev-only Home previewMini=error|paused uses isolated visual state, not a real failed-stream claim.
