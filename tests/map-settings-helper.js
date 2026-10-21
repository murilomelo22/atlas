export async function openMapSettings(page) {
  const button = page.locator('#map-settings-button');
  if (await button.isVisible() && await button.getAttribute('aria-expanded') === 'false') {
    await button.click();
  }
}
