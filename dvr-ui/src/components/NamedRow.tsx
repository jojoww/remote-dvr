import { Stack } from '@mui/material'
import React from 'react'

interface Props {
    name: string,
    content: React.ReactNode
}

export const NamedRow = (props: Props) => {
    return (
        <Stack direction="row">
            <div style={{ width: "25%", display: "inline-block" }}>
                {props.name}
            </div>
            <div style={{ width: "25%", display: "inline-block" }}>
                {props.content}
            </div>
        </Stack>
    )
}
