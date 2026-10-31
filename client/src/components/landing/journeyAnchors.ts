/**
 * Reads the scroll positions that the 3D journey is anchored to, from every element marked with
 * data-journey-step. An element aligned to "top" anchors its step where it reaches the top of the
 * screen; any other element anchors its step where its middle reaches the middle of the screen.
 * Positions past the end of the page are pulled back to the last reachable scroll position.
 */
export function measureJourneyAnchors(): number[] {
  const viewport = window.innerHeight;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewport);
  const marks = Array.from(document.querySelectorAll<HTMLElement>("[data-journey-step]"))
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const position = element.dataset.journeyAlign === "top" ? top : top + rect.height / 2 - viewport / 2;
      return { step: Number(element.dataset.journeyStep), position: Math.min(Math.max(position, 0), maxScroll) };
    })
    .sort((a, b) => a.step - b.step);

  const anchors: number[] = [];
  for (const mark of marks) {
    anchors.push(Math.max(mark.position, anchors.length > 0 ? anchors[anchors.length - 1] : 0));
  }
  return anchors;
}
