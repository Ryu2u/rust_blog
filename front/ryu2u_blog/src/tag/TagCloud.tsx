/**
 * 标签云组件
 * 展示 /tag/cloud 返回的标签及其文章数，默认只显示前 N 个，可展开全部。
 * 分类页与标签页共用，点击标签由调用方决定跳转行为。
 */
import './TagCloud.scss'
import {useState} from "react";
import {Card, Space, Tag as AntTag, Typography} from "antd";
import {TagOutlined} from "@ant-design/icons";
import {TagCount} from "../common/Structs";

const {Title} = Typography;

/** 折叠状态下默认展示的标签数量 */
export const DEFAULT_VISIBLE_TAG_COUNT = 30;

interface TagCloudProps {
    /** 标签及文章数，已由后端按文章数倒序排列 */
    tags: TagCount[];
    /** 当前选中的标签名，用于高亮 */
    activeName?: string;
    /** 点击标签回调 */
    onTagClick: (name: string) => void;
    /** 折叠状态下展示的数量 */
    visibleCount?: number;
    /** 卡片标题 */
    title?: string;
}

export function TagCloud({
    tags,
    activeName,
    onTagClick,
    visibleCount = DEFAULT_VISIBLE_TAG_COUNT,
    title = '所有标签'
}: TagCloudProps) {
    const [expanded, setExpanded] = useState(false);
    const collapsible = tags.length > visibleCount;
    const visibleTags = collapsible && !expanded ? tags.slice(0, visibleCount) : tags;

    return (
        <Card
            className="tag-cloud"
            bordered={false}
            style={{
                backgroundColor: 'var(--color-post-content-bg-default)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
            }}
        >
            <Title level={3} style={{color: 'var(--color-font-default)'}}>
                <TagOutlined style={{color: 'var(--color-primary)'}}/> {title}
                <span className="tag-cloud__total">（{tags.length}）</span>
            </Title>
            <Space size={[12, 12]} wrap>
                {visibleTags.map((tagItem) => {
                    const active = tagItem.name === activeName;
                    return (
                        <AntTag
                            key={tagItem.name}
                            onClick={() => onTagClick(tagItem.name)}
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
                            {tagItem.name}
                            <span className="tag-cloud__count">{tagItem.count}</span>
                        </AntTag>
                    );
                })}
            </Space>
            {collapsible && (
                <div className="tag-cloud__toggle">
                    <button
                        type="button"
                        className="tag-cloud__toggle-btn"
                        onClick={() => setExpanded((prev) => !prev)}
                    >
                        {expanded ? '收起 ∧' : `展开全部 (${tags.length}) ∨`}
                    </button>
                </div>
            )}
        </Card>
    );
}
