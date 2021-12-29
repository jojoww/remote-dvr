import { ToggleButton, ToggleButtonGroup } from '@mui/material'
import React from 'react'

interface Props {
    initialValue: string,
    names: string[],
    itemChanged: (name: string) => void,
    small: boolean
}

export const ItemSelection = (props: Props) => {

    const [name, setName] = React.useState(props.initialValue);

    const handleName = (event: any, newName: string) => {
        setName(newName);
        props.itemChanged(newName);
    };

    return (
        <ToggleButtonGroup
            value={name}
            size={props.small ? 'small' : 'large'}
            exclusive
            onChange={handleName}
            aria-label="text alignment">
            {
                props.names.map((item) => {
                    return <ToggleButton value={item}>{item}</ToggleButton>
                })
            }
            
            
        </ToggleButtonGroup>
    )
}

ItemSelection.defaultProps = {
    small: false
  };
