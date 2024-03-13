import {Editor} from "@bytemd/react";
import gfm from "@bytemd/plugin-gfm";
import {useEffect, useState} from "react";
import "./md.scss"

const plugins = [
    gfm(),
    // Add more plugins here
]

export function MdEditor({getContent, content}) {

    const [value, setValue] = useState('')

    useEffect(() => {
        console.log('content  -> ' + content);
        if (!content) {
            content = '';
        }
        setValue(content)
    }, [])


    return (
        <>
            <Editor
                mode={'split'}
                value={value}
                plugins={plugins}
                onChange={(v) => {
                    setValue(v);
                    getContent(v);
                }}/>
        </>
    )
}