import { Table, TableProps, Tag, Input, Button, Space, Card, Row, Col, Select, Popconfirm, message, Badge, Tooltip } from "antd";
import { useEffect, useRef, useState } from "react";
import { PageInfo, Comment } from "../../common/Structs";
import CommentService from "../../service/CommentService";
import { formatDate } from "../../common/utils";
import { SearchOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, FilterOutlined, MessageOutlined, UserOutlined } from "@ant-design/icons";

const { Option } = Select;
const { Search } = Input;
const { TextArea } = Input;

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

    useEffect(() => {
        getDataList();
    }, []);

    function getDataList() {
        setLoading(true);
        // 模拟数据加载
        setTimeout(() => {
            const mockData: Comment[] = [
                {
                    id: 1,
                    post_id: 1,
                    post_title: 'React 18 新特性详解',
                    user_id: 1,
                    user_name: '张三',
                    user_email: 'zhangsan@example.com',
                    content: '这篇文章写得很好，对React 18的新特性讲解得很清楚，特别是并发渲染的部分。',
                    status: 1,
                    ip_address: '192.168.1.100',
                    created_time: Date.now() - 2 * 60 * 60 * 1000
                },
                {
                    id: 2,
                    post_id: 1,
                    post_title: 'React 18 新特性详解',
                    user_id: 2,
                    user_name: '李四',
                    user_email: 'lisi@example.com',
                    content: '感谢分享！请问Suspense在实际项目中应该如何使用？',
                    parent_id: 1,
                    parent_user_name: '张三',
                    status: 0,
                    ip_address: '192.168.1.101',
                    created_time: Date.now() - 1 * 60 * 60 * 1000
                },
                {
                    id: 3,
                    post_id: 2,
                    post_title: 'TypeScript 高级类型技巧',
                    user_id: 3,
                    user_name: '王五',
                    user_email: 'wangwu@example.com',
                    content: '非常实用的技巧，收藏了！',
                    status: 1,
                    ip_address: '192.168.1.102',
                    created_time: Date.now() - 3 * 60 * 60 * 1000
                },
                {
                    id: 4,
                    post_id: 3,
                    post_title: 'Vite 构建优化实践',
                    user_id: 4,
                    user_name: '赵六',
                    user_email: 'zhaoliu@example.com',
                    content: '垃圾文章，浪费时间',
                    status: 2,
                    ip_address: '192.168.1.103',
                    created_time: Date.now() - 5 * 60 * 60 * 1000
                },
                {
                    id: 5,
                    post_id: 2,
                    post_title: 'TypeScript 高级类型技巧',
                    user_id: 5,
                    user_name: '孙七',
                    user_email: 'sunqi@example.com',
                    content: '能否详细讲解一下条件类型的使用场景？我在项目中遇到了一些问题。',
                    status: 0,
                    ip_address: '192.168.1.104',
                    created_time: Date.now() - 30 * 60 * 1000
                }
            ];
            
            pageInfoRef.current.total = mockData.length;
            pageInfoRef.current.list = mockData;
            setCommentList(mockData);
            setLoading(false);
        }, 500);
    }

    const handleApprove = (id: number) => {
        setLoading(true);
        setTimeout(() => {
            setCommentList(commentList.map(comment => 
                comment.id === id ? { ...comment, status: 1 } : comment
            ));
            messageApi.success('评论已通过');
            setLoading(false);
        }, 300);
    };

    const handleReject = (id: number) => {
        setLoading(true);
        setTimeout(() => {
            setCommentList(commentList.map(comment => 
                comment.id === id ? { ...comment, status: 2 } : comment
            ));
            messageApi.success('评论已拒绝');
            setLoading(false);
        }, 300);
    };

    const handleDelete = (id: number) => {
        setLoading(true);
        setTimeout(() => {
            setCommentList(commentList.filter(comment => comment.id !== id));
            messageApi.success('删除成功');
            setLoading(false);
        }, 300);
    };

    const handleBatchApprove = () => {
        if (selectedRowKeys.length === 0) {
            messageApi.warning('请选择要通过的评论');
            return;
        }
        setLoading(true);
        setTimeout(() => {
            setCommentList(commentList.map(comment => 
                selectedRowKeys.includes(comment.id) ? { ...comment, status: 1 } : comment
            ));
            setSelectedRowKeys([]);
            messageApi.success('批量通过成功');
            setLoading(false);
        }, 300);
    };

    const handleBatchDelete = () => {
        if (selectedRowKeys.length === 0) {
            messageApi.warning('请选择要删除的评论');
            return;
        }
        setLoading(true);
        setTimeout(() => {
            setCommentList(commentList.filter(comment => !selectedRowKeys.includes(comment.id)));
            setSelectedRowKeys([]);
            messageApi.success('批量删除成功');
            setLoading(false);
        }, 300);
    };

    const getStatusTag = (status: number) => {
        const statusMap = {
            0: { color: 'orange', text: '待审核' },
            1: { color: 'green', text: '已通过' },
            2: { color: 'red', text: '已拒绝' }
        };
        const statusInfo = statusMap[status as keyof typeof statusMap];
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
    };

    const columns: TableProps<Comment>['columns'] = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 60,
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
                            <UserOutlined />
                            <strong>{record.user_name}</strong>
                            {record.user_email && (
                                <span style={{ color: '#999', fontSize: 12 }}>({record.user_email})</span>
                            )}
                        </Space>
                    </div>
                    <div style={{ color: '#333' }}>{content}</div>
                    {record.parent_id && (
                        <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                            <MessageOutlined style={{ marginRight: 4 }} />
                            <span style={{ color: '#999', fontSize: 12 }}>
                                回复 @{record.parent_user_name}
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
                    <a>{title}</a>
                </Tooltip>
            ),
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status) => getStatusTag(status),
            filters: [
                { text: '待审核', value: 0 },
                { text: '已通过', value: 1 },
                { text: '已拒绝', value: 2 },
            ],
            onFilter: (value, record) => record.status === value,
        },
        {
            title: 'IP地址',
            dataIndex: 'ip_address',
            key: 'ip_address',
            width: 140,
        },
        {
            title: '评论时间',
            dataIndex: 'created_time',
            key: 'created_time',
            width: 180,
            render: (created_time) => formatDate(new Date(created_time)),
            sorter: (a, b) => a.created_time - b.created_time,
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
                            onClick={() => handleApprove(record.id)}
                        />
                    )}
                    {record.status !== 2 && (
                        <Button 
                            icon={<CloseOutlined />} 
                            size="small"
                            onClick={() => handleReject(record.id)}
                        />
                    )}
                    <Popconfirm
                        title="确定要删除这条评论吗？"
                        description="删除后将无法恢复"
                        onConfirm={() => handleDelete(record.id)}
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

    // 统计数据
    const pendingCount = commentList.filter(c => c.status === 0).length;
    const approvedCount = commentList.filter(c => c.status === 1).length;
    const rejectedCount = commentList.filter(c => c.status === 2).length;

    return (
        <>
            {contextHolder}
            <Card>
                <Card title="评论管理" extra={
                    <Space size="middle">
                        <Badge count={pendingCount} showZero>
                            <Tag color="orange">待审核</Tag>
                        </Badge>
                        <Badge count={approvedCount} showZero>
                            <Tag color="green">已通过</Tag>
                        </Badge>
                        <Badge count={rejectedCount} showZero>
                            <Tag color="red">已拒绝</Tag>
                        </Badge>
                    </Space>
                }>
                    {/* 搜索和筛选 */}
                    <Card size="small" style={{ marginBottom: 16 }}>
                        <Row gutter={16} align="middle">
                            <Col span={10}>
                                <Search
                                    placeholder="搜索评论内容或用户名"
                                    value={searchParams.keyword}
                                    onChange={(e) => setSearchParams({ ...searchParams, keyword: e.target.value })}
                                    onSearch={handleSearch}
                                    style={{ width: '100%' }}
                                    prefix={<SearchOutlined />}
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
                    </Card>

                    {/* 批量操作 */}
                    {selectedRowKeys.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <Space>
                                <span>已选择 {selectedRowKeys.length} 项</span>
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

                    {/* 评论列表 */}
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
                </Card>
            </Card>
        </>
    );
}