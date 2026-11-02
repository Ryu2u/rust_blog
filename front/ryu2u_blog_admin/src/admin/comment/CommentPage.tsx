import { Table, TableProps, Tag, Input, Button, Space, Row, Col, Select, Popconfirm, message, Badge, Tooltip } from "antd";
import { useEffect, useRef, useState } from "react";
import { PageInfo, Comment } from "../../common/Structs";
import CommentService from "../../service/CommentService";
import { formatDate } from "../../common/utils";
import { SearchOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, FilterOutlined, MessageOutlined, UserOutlined } from "@ant-design/icons";

const { Option } = Select;
const { Search } = Input;

interface SearchParams {
    keyword: string;
    status: number | null;
    post_id: number | null;
}

export function CommentPage() {
    const pageInfoRef = useRef(new PageInfo());
    const [loading, setLoading] = useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [searchParams, setSearchParams] = useState<SearchParams>({
        keyword: '',
        status: null,
        post_id: null
    });
    const [messageApi, contextHolder] = message.useMessage();
    const [commentList, setCommentList] = useState<Comment[]>([]);
    const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });

    function fetchCounts() {
        CommentService.comment_counts().then(res => {
            if (res.obj) {
                setCounts(res.obj);
            }
        });
    }

    useEffect(() => {
        getDataList();
        fetchCounts();
    }, []);

    function getDataList() {
        setLoading(true);
        CommentService.commentListPage({
            page_num: pageInfoRef.current.page_num,
            page_size: pageInfoRef.current.page_size,
            keyword: searchParams.keyword || undefined,
            status: searchParams.status,
            post_id: searchParams.post_id,
        }).then(res => {
            if (res.obj) {
                pageInfoRef.current.total = res.obj.total;
                setCommentList(res.obj.list || []);
            }
        }).finally(() => {
            setLoading(false);
        });
    }

    const handleApprove = (id: number) => {
        setLoading(true);
        CommentService.comment_approve(id).then(res => {
            messageApi.success(res.msg || '评论已通过');
            getDataList();
            fetchCounts();
        }).catch(() => {
            setLoading(false);
        });
    };

    const handleReject = (id: number) => {
        setLoading(true);
        CommentService.comment_reject(id).then(res => {
            messageApi.success(res.msg || '评论已拒绝');
            getDataList();
            fetchCounts();
        }).catch(() => {
            setLoading(false);
        });
    };

    const handleDelete = (id: number) => {
        setLoading(true);
        CommentService.comment_delete(id).then(res => {
            messageApi.success(res.msg || '删除成功');
            getDataList();
            fetchCounts();
        }).catch(() => {
            setLoading(false);
        });
    };

    const handleBatchApprove = () => {
        if (selectedRowKeys.length === 0) {
            messageApi.warning('请选择要通过的评论');
            return;
        }
        setLoading(true);
        CommentService.comment_batch_approve(selectedRowKeys as number[]).then(res => {
            messageApi.success(res.msg || '批量审核成功');
            setSelectedRowKeys([]);
            getDataList();
            fetchCounts();
        }).catch(() => {
            setLoading(false);
        });
    };

    const handleBatchDelete = () => {
        if (selectedRowKeys.length === 0) {
            messageApi.warning('请选择要删除的评论');
            return;
        }
        setLoading(true);
        CommentService.comment_batch_delete(selectedRowKeys as number[]).then(res => {
            messageApi.success(res.msg || '批量删除成功');
            setSelectedRowKeys([]);
            getDataList();
            fetchCounts();
        }).catch(() => {
            setLoading(false);
        });
    };

    const getStatusTag = (status: number) => {
        const statusMap = {
            0: { className: 'admin-tag', text: '待审核' },
            1: { className: 'admin-tag admin-tag--active', text: '已通过' },
            2: { className: 'admin-tag admin-tag--danger', text: '已拒绝' }
        };
        const statusInfo = statusMap[status as keyof typeof statusMap];
        return <Tag className={statusInfo.className}>{statusInfo.text}</Tag>;
    };

    const columns: TableProps<Comment>['columns'] = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 60,
            render: (value) => <span style={{ color: 'var(--color-text-muted)' }}>{value}</span>,
        },
        {
            title: '评论内容',
            dataIndex: 'content',
            key: 'content',
            width: 300,
            render: (content, record) => (
                <div>
                    <div style={{ marginBottom: 8 }}>
                        <Space>
                            <UserOutlined style={{ color: 'var(--color-text-muted)' }} />
                            <strong style={{ color: 'var(--color-text)' }}>{record.user_name}</strong>
                            {record.user_email && (
                                <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>({record.user_email})</span>
                            )}
                        </Space>
                    </div>
                    <div style={{ color: 'var(--color-text-secondary)' }}>{content}</div>
                    {record.parent_id && (
                        <div style={{ marginTop: 8, padding: 8, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                            <MessageOutlined style={{ marginRight: 4, color: 'var(--color-text-muted)' }} />
                            <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
                                回复评论 #{record.parent_id}
                            </span>
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: '所属文章',
            dataIndex: 'post_title',
            key: 'post_title',
            width: 200,
            ellipsis: true,
            render: (title) => (
                <Tooltip title={title}>
                    <a style={{ color: 'var(--color-text-secondary)' }}>{title}</a>
                </Tooltip>
            ),
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status) => getStatusTag(status ?? 0),
            filters: [
                { text: '待审核', value: 0 },
                { text: '已通过', value: 1 },
                { text: '已拒绝', value: 2 },
            ],
            onFilter: (value, record) => (record.status ?? 0) === value,
        },
        {
            title: '评论时间',
            dataIndex: 'created_time',
            key: 'created_time',
            width: 180,
            render: (created_time) => <span style={{ color: 'var(--color-text-secondary)' }}>{created_time ? formatDate(new Date(created_time * 1000)) : '-'}</span>,
            sorter: (a, b) => (a.created_time ?? 0) - (b.created_time ?? 0),
        },
        {
            title: '操作',
            key: 'action',
            width: 200,
            fixed: 'right',
            render: (_, record) => (
                <Space size="small" wrap>
                    {record.status !== 1 && (
                        <Button
                            type="primary"
                            icon={<CheckOutlined />}
                            size="small"
                            onClick={() => handleApprove(record.id!)}
                        />
                    )}
                    {record.status !== 2 && (
                        <Button
                            icon={<CloseOutlined />}
                            size="small"
                            onClick={() => handleReject(record.id!)}
                        />
                    )}
                    <Popconfirm
                        title="确定要删除这条评论吗？"
                        description="删除后将无法恢复"
                        onConfirm={() => handleDelete(record.id!)}
                        okText="确定"
                        cancelText="取消"
                    >
                        <Button
                            danger
                            icon={<DeleteOutlined />}
                            size="small"
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const paginationChange = (index: number, size: number) => {
        pageInfoRef.current.page_num = index;
        pageInfoRef.current.page_size = size;
        getDataList();
    };

    const handleSearch = () => {
        pageInfoRef.current.page_num = 1;
        getDataList();
    };

    const handleReset = () => {
        setSearchParams({
            keyword: '',
            status: null,
            post_id: null
        });
        pageInfoRef.current.page_num = 1;
        getDataList();
    };

    const rowSelection = {
        selectedRowKeys,
        onChange: (keys: React.Key[]) => {
            setSelectedRowKeys(keys);
        },
    };

    const { pending: pendingCount, approved: approvedCount, rejected: rejectedCount } = counts;

    return (
        <>
            {contextHolder}
            <div>
                <div className="admin-page-head">
                    <h2 className="admin-page-title">评论管理</h2>
                    <Space size="middle">
                        <Badge count={pendingCount} showZero style={{ background: 'var(--color-text-muted)' }}>
                            <Tag className="admin-tag">待审核</Tag>
                        </Badge>
                        <Badge count={approvedCount} showZero style={{ background: 'var(--color-primary)' }}>
                            <Tag className="admin-tag admin-tag--active">已通过</Tag>
                        </Badge>
                        <Badge count={rejectedCount} showZero style={{ background: 'var(--color-text-muted)' }}>
                            <Tag className="admin-tag">已拒绝</Tag>
                        </Badge>
                    </Space>
                </div>

                <div className="admin-filter-panel">
                    <Row gutter={16} align="middle">
                        <Col span={10}>
                            <Search
                                placeholder="搜索评论内容或用户名"
                                value={searchParams.keyword}
                                onChange={(e) => setSearchParams({ ...searchParams, keyword: e.target.value })}
                                onSearch={handleSearch}
                                style={{ width: '100%' }}
                                prefix={<SearchOutlined style={{ color: 'var(--color-text-muted)' }} />}
                            />
                        </Col>
                        <Col span={6}>
                            <Select
                                placeholder="状态"
                                value={searchParams.status}
                                onChange={(value) => setSearchParams({ ...searchParams, status: value })}
                                style={{ width: '100%' }}
                                allowClear
                            >
                                <Option value={0}>待审核</Option>
                                <Option value={1}>已通过</Option>
                                <Option value={2}>已拒绝</Option>
                            </Select>
                        </Col>
                        <Col span={8}>
                            <Space>
                                <Button
                                    type="primary"
                                    icon={<SearchOutlined />}
                                    onClick={handleSearch}
                                >
                                    搜索
                                </Button>
                                <Button
                                    icon={<FilterOutlined />}
                                    onClick={handleReset}
                                >
                                    重置
                                </Button>
                            </Space>
                        </Col>
                    </Row>
                </div>

                {selectedRowKeys.length > 0 && (
                    <div className="admin-selection-bar">
                        <Space>
                            <span style={{ color: 'var(--color-text-secondary)' }}>已选择 {selectedRowKeys.length} 项</span>
                            <Button
                                type="primary"
                                icon={<CheckOutlined />}
                                onClick={handleBatchApprove}
                            >
                                批量通过
                            </Button>
                            <Popconfirm
                                title="确定要批量删除这些评论吗？"
                                description="删除后将无法恢复"
                                onConfirm={handleBatchDelete}
                                okText="确定"
                                cancelText="取消"
                            >
                                <Button
                                    danger
                                    icon={<DeleteOutlined />}
                                >
                                    批量删除
                                </Button>
                            </Popconfirm>
                        </Space>
                    </div>
                )}

                <Table
                    loading={loading}
                    columns={columns}
                    pagination={{
                        showSizeChanger: true,
                        onChange: paginationChange,
                        total: pageInfoRef.current.total,
                        defaultPageSize: 10,
                        showTotal: (total) => `共 ${total} 条评论`
                    }}
                    rowKey={(record) => record.id}
                    dataSource={commentList}
                    rowSelection={rowSelection}
                    scroll={{ x: 1200 }}
                />
            </div>
        </>
    );
}
