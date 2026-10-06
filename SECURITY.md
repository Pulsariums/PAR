# Security Policy

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private reporting:
**Security → Report a vulnerability** on <https://github.com/Pulsariums/PAR>.

Include the PAR version, a minimal subtitle script or page that reproduces it, and the browser. You can expect an
acknowledgement within a few days.

## Scope notes

PAR renders subtitle text into the DOM as text nodes and SVG paths built from parsed numbers; it never evaluates script
content. Reports about the demo site's user-supplied video URLs or files are in scope only when they affect other visitors.
