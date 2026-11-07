import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { PlaybackControls } from './ExperimentTools';
const meta={title:'Components/PlaybackControls',component:PlaybackControls,tags:['autodocs'],parameters:{previewWidth:960},args:{duration:360,position:360}} satisfies Meta<typeof PlaybackControls>;
export default meta;
export const Recording:StoryObj<typeof meta>={play:async({canvasElement})=>{const canvas=within(canvasElement);await userEvent.click(canvas.getByRole('button',{name:'Restart recording'}));await expect(canvas.getByRole('slider')).toHaveAttribute('aria-valuenow','0');}};
