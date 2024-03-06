import './home.css'
import {Card} from "../components/Card";
import {UserInfo} from "../components/UserInfo";
import {Weather} from "../components/Weather";
import {FloatButton} from "antd";
import {QuestionCircleOutlined, SettingOutlined, SyncOutlined} from '@ant-design/icons';
import {useEffect, useState} from "react";
import gfm from '@bytemd/plugin-gfm'
import {Editor, Viewer} from '@bytemd/react'
import './md.scss'
import {Temp} from "../components/Temp";

const plugins = [
    gfm(),
    // Add more plugins here
]

export function Home() {
    const [side_div, set_side_div] = useState(null);
    const [value, setValue] = useState('')

    useEffect(() => {

        setValue(`---
# frontmatter: https://jekyllrb.com/docs/front-matter/
layout: post
title: Blogging Like a Hacker
---

## Markdown Basic Syntax

I just love **bold text**. Italicized text is the _cat's meow_. At the command prompt, type \`nano\`.

My favorite markdown editor is [ByteMD](https://github.com/bytedance/bytemd).

1. First item
2. Second item
3. Third item

> Dorothy followed her through many of the beautiful rooms in her castle.

\`\`\`js
import gfm from '@bytemd/plugin-gfm'
import { Editor, Viewer } from 'bytemd'

const plugins = [
  gfm(),
  // Add more plugins here
]

const editor = new Editor({
  target: document.body, // DOM to render
  props: {
    value: '',
    plugins,
  },
})

editor.on('change', (e) => {
  editor.$set({ value: e.detail.value })
})
\`\`\`

## GFM Extended Syntax

Automatic URL Linking: https://github.com/bytedance/bytemd

~~The world is flat.~~ We now know that the world is round.

- [x] Write the press release
- [ ] Update the website
- [ ] Contact the media

| Syntax    | Description |
| --------- | ----------- |
| Header    | Title       |
| Paragraph | Text        |

## Footnotes

Here's a simple footnote,[^1] and here's a longer one.[^bignote]

[^1]: This is the first footnote.
[^bignote]: Here's one with multiple paragraphs and code.

    Indent paragraphs to include them in the footnote.

    \`{ my code }\`

    Add as many paragraphs as you like.

## Gemoji

Thumbs up: :+1:, thumbs down: :-1:.

Families: :family_man_man_boy_boy:

Long flags: :wales:, :scotland:, :england:.

## Math Equation

Inline math equation: $a+b$

$$
\\displaystyle \\left( \\sum_{k=1}^n a_k b_k \\right)^2 \\leq \\left( \\sum_{k=1}^n a_k^2 \\right) \\left( \\sum_{k=1}^n b_k^2 \\right)
$$

## Mermaid Diagrams

\`\`\`mermaid
graph TD;
  A-->B;
  A-->C;
  B-->D;
  C-->D;
\`\`\`
`)


        window.addEventListener('scroll', () => {
            if (side_div) {
                const rect = side_div.getBoundingClientRect();
                console.log(rect.top);
            }
        })
    }, [side_div])


    return (
        <>
            <div className={"header"}>
                <div className={"header-item"}>
                    <div className={"logo-div"}>
                        Ryu2u の Blog
                    </div>
                </div>
            </div>

            <div className={"container flex"}>
                <div className={"content"}>
                    <Editor
                        mode={'split'}
                        value={value}
                        plugins={plugins}
                        onChange={(v) => {
                            setValue(v)
                        }}/>

                    <Temp/>

                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                    <br/>
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    adasdgasdf sdg adfa sg
                    adasdgasdf sdg adfa sg sdadgas f adasdgasdf
                    <br/>
                    sdg adfa sg
                    <br/>
                </div>

                <div className={"side-list"}>
                    <div ref={set_side_div} className={"side-content"}>
                        <UserInfo/>
                        <Weather/>
                        <Card/>
                        <Card/>
                        <Card/>
                        <Card/>
                        <Card/>
                        <Card/>
                        <Card/>
                        <Card/>
                        <Card/>
                    </div>
                </div>

            </div>


            <div className={"footer"}>
                this is footer
                <br/>
                this is footer
                <br/>
            </div>

            <FloatButton.Group shape="square" style={{right: 50}}>
                <FloatButton icon={<QuestionCircleOutlined/>}/>
                <FloatButton icon={<SettingOutlined spin/>}/>
                <FloatButton icon={<SyncOutlined/>}/>
                <FloatButton.BackTop visibilityHeight={0}/>
            </FloatButton.Group>

        </>
    )
}