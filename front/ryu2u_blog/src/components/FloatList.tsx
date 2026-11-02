import {ArrowUpOutlined} from "@ant-design/icons";
import {useEffect, useState} from "react";

/// 右下角浮动按钮：页面滚动一段距离后显示「回到顶部」
export function FloatList() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const onScroll = () => setVisible(window.scrollY > 400);
        onScroll();
        window.addEventListener('scroll', onScroll, {passive: true});
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <>
            <div className={"float-div"}>
                <button
                    type="button"
                    aria-label="回到顶部"
                    className={visible ? 'float-btn is-visible' : 'float-btn'}
                    onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}
                >
                    <ArrowUpOutlined/>
                </button>
            </div>
        </>
    )
}
