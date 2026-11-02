/**
 * chips 云组件（分类 / 标签共用）
 * 可选展示计数、可选折叠展开（超过阈值时默认只显示前 N 个）。
 * 点击行为由调用方通过 onChipClick 决定。
 */
import './ChipCloud.scss'
import {useState} from "react";

/** chip 数据：名称 + 可选计数 */
export interface CloudChip {
    name: string;
    count?: number;
}

/** 折叠状态下默认展示的 chip 数量（标签云用） */
export const DEFAULT_VISIBLE_CHIP_COUNT = 30;

interface ChipCloudProps {
    /** 分区标题 */
    title: string;
    /** chip 列表 */
    items: CloudChip[];
    /** 点击 chip 回调 */
    onChipClick: (name: string) => void;
    /** 当前选中项，用于高亮 */
    activeName?: string;
    /** 折叠阈值：超过该数量时默认只显示前 N 个并给出「展开全部」按钮；不传则不折叠 */
    visibleCount?: number;
}

export function ChipCloud({
    title,
    items,
    onChipClick,
    activeName,
    visibleCount,
}: ChipCloudProps) {
    const [expanded, setExpanded] = useState(false);
    const collapsible = visibleCount !== undefined && items.length > visibleCount;
    const visibleItems = collapsible && !expanded ? items.slice(0, visibleCount) : items;

    return (
        <section className="chip-cloud">
            <div className="chip-cloud__head">
                <h2 className="chip-cloud__title">{title}</h2>
                <span className="chip-cloud__total">{items.length}</span>
            </div>
            <div className="chip-cloud__list">
                {visibleItems.map((item) => (
                    <button
                        type="button"
                        key={item.name}
                        className={item.name === activeName ? 'chip is-active' : 'chip'}
                        onClick={() => onChipClick(item.name)}
                    >
                        {item.name}
                        {item.count !== undefined && (
                            <span className="chip__count">{item.count}</span>
                        )}
                    </button>
                ))}
            </div>
            {collapsible && (
                <div className="chip-cloud__toggle">
                    <button
                        type="button"
                        className="chip-cloud__toggle-btn"
                        onClick={() => setExpanded((prev) => !prev)}
                    >
                        {expanded ? '收起' : `展开全部（${items.length}）`}
                    </button>
                </div>
            )}
        </section>
    );
}
