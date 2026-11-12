import { userEvent, waitFor, within } from 'storybook/test';

/** Opens a DvSelect and picks an option by value or label, as `userEvent.selectOptions` does for a native select. */
export async function chooseOption(select: HTMLElement, option: string) {
  if (select.getAttribute('aria-expanded') !== 'true') await userEvent.click(select);
  const list = await waitFor(() => {
    const element = document.getElementById(select.getAttribute('aria-controls') ?? '');
    if (!element) throw new Error('The select list did not open');
    return element;
  });
  const byValue = [...list.querySelectorAll<HTMLElement>('[role=option]')].find(element => element.dataset.value === option);
  await userEvent.click(byValue ?? within(list).getByRole('option', { name: option }));
}
