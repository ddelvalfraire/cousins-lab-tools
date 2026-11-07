import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataPlotPanel } from './ExperimentTools';
import { alignedData, samples } from '../fixtures';
const meta={title:'Components/DataPlotPanel',component:DataPlotPanel,tags:['autodocs'],parameters:{previewWidth:720},args:{title:'Raw signals',data:alignedData(samples),series:[{label:'Mass 44',unit:'mV'},{label:'Mass 49',unit:'mV'}]}} satisfies Meta<typeof DataPlotPanel>;
export default meta;
export const ChartAndTable:StoryObj<typeof meta>={};
