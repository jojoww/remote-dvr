import { Button } from '@mui/material'
import React from 'react'

interface Props {
    text: string,
    onClick: () => void
}

export const MenuButton = (props: Props) => {
    return (
        <Button variant='contained' onClick={props.onClick}>{props.text}</Button>
    )
}
