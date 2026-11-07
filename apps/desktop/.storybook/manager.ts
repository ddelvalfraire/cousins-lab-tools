import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';
addons.setConfig({ theme: create({ base: 'light', brandTitle: 'DVDash UI catalog', colorPrimary: '#063D30', colorSecondary: '#063D30' }) });
