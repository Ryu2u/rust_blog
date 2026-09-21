/**
 * chips 云组件（分类 / 标签共用）
 * 可选展示计数、可选折叠展开（超过阈值时默认只显示前 N 个）。
 * 样式与站点终端风格一致，点击行为由调用方通过 onChipClick 决定。
 */
import './ChipCloud.scss'
import {ReactNode, useState} from "react";
import {Card, Space, Tag as AntTag, Typography} from "antd";
import {TagOutlined} from "@ant-design/icons";

const {Title} = Typography;

/** chip 数据：名称 + 可选计数 */
export interface CloudChip {
    name: string;
    count?: number;
}

/** 折叠状态下默认展示的 chip 数量（标签云用） */
export const DEFAULT_VISIBLE_CHIP_COUNT = 30;

interface ChipCloudProps {
    /** 卡片标题 */
    title: string;
    /** chip 列表 */
    items: CloudChip[];
    /** 点击 chip 回调 */
    onChipClick: (name: string) => void;
    /** 当前选中项，用于高亮 */
    activeName?: string;
    /** 折叠阈值：超过该数量时默认只显示前 N 个并给出「展开全部」按钮；不传则不折叠 */
    visibleCount?: number;
    /** 标题图标 */
    icon?: ReactNode;
}

export function ChipCloud({
    title,
    items,
    onChipClick,
    activeName,
    visibleCount,
    icon = <TagOutlined style={{color: 'var(--color-primary)'}}/>
}: ChipCloudProps) {
    const [expanded, setExpanded] = useState(false);
    const collapsible = visibleCount !== undefined && items.length > visibleCount;
    const visibleItems = collapsible && !expanded ? items.slice(0, visibleCount) : items;

    return (
        <Card
            className="chip-cloud"
            bordered={false}
            style={{
                backgroundColor: 'var(--color-post-content-bg-default)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
            }}
        >
            <Title level={3} style={{color: 'var(--color-font-default)'}}>
                {icon} {title}
                <span className="chip-cloud__total">（{items.length}）</span>
            </Title>
            <Space size={[12, 12]} wrap>
                {visibleItems.map((item) => {
                    const active = item.name === activeName;
                    return (
                        <AntTag
                            key={item.name}
                            onClick={() => onChipClick(item.name)}
                            style={{
                                cursor: 'pointer',
                                fontSize: '14px',
                                padding: '4px 12px',
                                borderRadius: '16px',
                                backgroundColor: active ? 'var(--color-primary)' : 'transparent',
                                color: active ? '#fff' : 'var(--color-font-default)',
                                border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-font-default)'}`,
                                opacity: active ? 1 : 0.8,
                                transition: 'all 0.3s ease'
                            }}
                        >
                            {item.name}
                            {item.count !== undefined && (
                                <span className="chip-cloud__count">{item.count}</span>
                            )}
                        </AntTag>
                    );
                })}
            </Space>
            {collapsible && (
                <div className="chip-cloud__toggle">
                    <button
                        type="button"
                        className="chip-cloud__toggle-btn"
                        onClick={() => setExpanded((prev) => !prev)}
                    >
                        {expanded ? '收起 ∧' : `展开全部 (${items.length}) ∨`}
                    </button>
                </div>
            )}
        </Card>
    );
}
