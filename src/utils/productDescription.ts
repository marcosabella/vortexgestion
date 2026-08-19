import DOMPurify from "dompurify";

export const PRODUCT_DESCRIPTION_COLORS = ["#19352f", "#52645d", "#d65e37", "#111827", "#b42318"] as const;
export const PRODUCT_DESCRIPTION_SIZES = ["14px", "16px", "20px"] as const;
const COLOR_ALIASES: Record<string, typeof PRODUCT_DESCRIPTION_COLORS[number]> = {
  "rgb(25, 53, 47)": "#19352f",
  "rgb(82, 100, 93)": "#52645d",
  "rgb(214, 94, 55)": "#d65e37",
  "rgb(17, 24, 39)": "#111827",
  "rgb(180, 35, 24)": "#b42318",
};

export function sanitizeProductDescription(value: string | null | undefined) {
  const clean = DOMPurify.sanitize(value || "", {
    ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "h2", "h3", "ul", "ol", "li", "span"],
    ALLOWED_ATTR: ["style"],
  });

  const template = document.createElement("template");
  template.innerHTML = clean;
  template.content.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    const color = element.style.color;
    const fontSize = element.style.fontSize;
    element.removeAttribute("style");
    const safeColor = COLOR_ALIASES[color] || (PRODUCT_DESCRIPTION_COLORS.includes(color as typeof PRODUCT_DESCRIPTION_COLORS[number]) ? color : "");
    if (safeColor) element.style.color = safeColor;
    if (PRODUCT_DESCRIPTION_SIZES.includes(fontSize as typeof PRODUCT_DESCRIPTION_SIZES[number])) element.style.fontSize = fontSize;
    if (!element.getAttribute("style")) element.removeAttribute("style");
  });
  return template.innerHTML;
}
