import { MenuButton } from './MenuButton';
import { ItemSelection } from './ItemSelection';
import React from 'react';
import { ImageSettings } from './ImageSettings';
import { NamedRow } from './NamedRow';
import { Card, Stack } from '@mui/material';

interface DVRMenuProps {
    message: string;
    channels: string[]
}

const DVRMenu = (props: DVRMenuProps) => {
    const renderModes = ['X', 'Y', 'Z', 'MIP', 'Iso', 'Xray'];
    const [renderMode, setRenderMode] = React.useState('MIP');


    return (
        <Card>
            <Stack spacing={2}>
                <h1>{props.message}</h1>
                <MenuButton
                    text={'Take screenshot'}
                    onClick={function (): void {
                        throw new Error('Function not implemented.');
                    }}
                />
                <ItemSelection names={renderModes} initialValue={renderMode} itemChanged={setRenderMode} />
                {props.channels.map((channel) => {
                    return <NamedRow name={channel} content={<ImageSettings />} />;
                })}
                Current render mode is {renderMode}
            </Stack>
            
        </Card>
    );
};

export default DVRMenu;
