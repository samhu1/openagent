export type ComponentIdentity = {
  file: string;
  name: string;
  line: number | null;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export function mountReviewOverlay(
  onElementSelect: (identity: ComponentIdentity, element: HTMLElement) => void
) {
  const overlay = document.createElement("div");
  overlay.id = "oagent-review-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "999999";
  document.body.appendChild(overlay);

  const highlight = document.createElement("div");
  highlight.style.position = "absolute";
  highlight.style.border = "2px solid #3b82f6"; // blue-500
  highlight.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
  highlight.style.pointerEvents = "none";
  highlight.style.display = "none";
  highlight.style.transition = "all 0.1s ease-out";
  overlay.appendChild(highlight);

  const tooltip = document.createElement("div");
  tooltip.style.position = "absolute";
  tooltip.style.background = "#1e293b"; // slate-800
  tooltip.style.color = "white";
  tooltip.style.padding = "4px 8px";
  tooltip.style.borderRadius = "4px";
  tooltip.style.fontSize = "12px";
  tooltip.style.fontFamily = "ui-monospace, monospace";
  tooltip.style.pointerEvents = "none";
  tooltip.style.display = "none";
  tooltip.style.whiteSpace = "nowrap";
  overlay.appendChild(tooltip);

  let currentTarget: HTMLElement | null = null;
  let isActive = false;

  const getNearestIdentity = (el: HTMLElement | null): HTMLElement | null => {
    while (el && el !== document.body) {
      if (el.hasAttribute("data-ai-file") || el.hasAttribute("data-ai-name")) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isActive) return;

    const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    if (!target || target === currentTarget || target === overlay || target === highlight) return;

    const identityNode = getNearestIdentity(target);

    if (identityNode) {
      currentTarget = identityNode;
      const rect = identityNode.getBoundingClientRect();
      
      highlight.style.display = "block";
      highlight.style.top = `${rect.top}px`;
      highlight.style.left = `${rect.left}px`;
      highlight.style.width = `${rect.width}px`;
      highlight.style.height = `${rect.height}px`;

      const file = identityNode.getAttribute("data-ai-file");
      const name = identityNode.getAttribute("data-ai-name");
      
      tooltip.style.display = "block";
      tooltip.style.top = `${Math.max(0, rect.top - 28)}px`;
      tooltip.style.left = `${rect.left}px`;
      tooltip.textContent = name ? `<${name}>` : (file ? file.split('/').pop() || 'file' : 'Element');
    } else {
      currentTarget = null;
      highlight.style.display = "none";
      tooltip.style.display = "none";
    }
  };

  const handleClick = (e: MouseEvent) => {
    if (!isActive || !currentTarget) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = currentTarget.getBoundingClientRect();
    const identity: ComponentIdentity = {
      file: currentTarget.getAttribute("data-ai-file") || "",
      name: currentTarget.getAttribute("data-ai-name") || "",
      line: parseInt(currentTarget.getAttribute("data-ai-line") || "0", 10) || null,
      boundingBox: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
    };

    onElementSelect(identity, currentTarget);
    deactivate();
  };

  const activate = () => {
    isActive = true;
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("click", handleClick, true);
    document.body.style.cursor = "crosshair";
  };

  const deactivate = () => {
    isActive = false;
    currentTarget = null;
    highlight.style.display = "none";
    tooltip.style.display = "none";
    document.removeEventListener("mousemove", handleMouseMove, true);
    document.removeEventListener("click", handleClick, true);
    document.body.style.cursor = "default";
  };

  return { activate, deactivate, unmount: () => overlay.remove() };
}
