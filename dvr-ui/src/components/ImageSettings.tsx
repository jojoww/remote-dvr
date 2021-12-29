import { Slider, Stack } from '@mui/material'
import React from 'react'
import { ItemSelection } from './ItemSelection'

interface Props {

}

export const ImageSettings = (props: Props) => {
    const colorModes = ["Gray", "Gray^-1", "Viridis", "Hot", "Custom"]
    const [colorMode, setColorMode] = React.useState("Hot")

    const [range, setRange] = React.useState([0, 1]);
    const [gamma, setGamma] = React.useState(0.5);

    const handleRangeSliderChange = (event: Event, value: number | number[], activeThumb: number) => {
        setRange(value as number[]);
    };

    const handleGammaSliderChange = (event: Event, value: number | number[], activeThumb: number) => {
        setGamma(value as number);
    };

    return (
        <Stack direction="row" spacing={2}>
            <Stack>
            <div style={{ width: "100%" }}>
                <ItemSelection small={true} names={colorModes} initialValue={colorMode} itemChanged={setColorMode} />
            </div>
            <div style={{ width: "100%" }}>
                <Slider
                    min={0}
                    max={1}
                    step={0.001}
                    value={range}
                    onChange={handleRangeSliderChange}
                    valueLabelDisplay="auto"
                />
            </div>
            </Stack>
            <div style={{ width: "100%" }}>
                <Slider
                    orientation='vertical'
                    min={0}
                    max={1}
                    step={0.001}
                    value={gamma}
                    onChange={handleGammaSliderChange}
                    valueLabelDisplay="auto"
                />
            </div>
        </Stack>
    )
}
