import "@testing-library/jest-dom/vitest";

// Stub scrollIntoView for jsdom
Element.prototype.scrollIntoView = () => {};
