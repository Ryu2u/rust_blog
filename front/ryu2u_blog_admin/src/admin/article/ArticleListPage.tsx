import { Table, TableProps, Tag, Input, Button, Space, Row, Col, Select, Popconfirm, message } from "antd";
import { useEffect, useRef, useState } from "react";
import { PageInfo, Post, PostTag } from "../../common/Structs";
import PostService from "../../service/PostService";
import { formatDate, getUuid } from "../../common/utils";
import { EyeInvisibleOutlined, EyeOutlined, SearchOutlined, DeleteOutlined, EditOutlined, PlusOutlined, FilterOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router";

const { Option } = Select;
const { Search } = Input;

interface SearchParams {
  keyword: string;
  author: string;
  status: number | null;
}

export const ArticleListPage = () => {

    const pageInfoRef = useRef(new PageInfo());
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [searchParams, setSearchParams] = useState<SearchParams>({
        keyword: '',
        author: '',
        status: null
    });
    const [messageApi, contextHolder] = message.useMessage();

    const titleClick = (value: Post) => {
        navigate(`/article/edit/${value.id}`);
    };

    const handleDelete = (id: number) => {
        setLoading(true);
        PostService.post_delete(id).then(res => {
            messageApi.success(res.msg);
            getDataList();
        }).finally(() => {
            setLoading(false);
        });
    };

    const handleBatchDelete = () => {
        if (selectedRowKeys.length === 0) {
            messageApi.warning('请选择要删除的文章');
            return;
        }
        setLoading(true);
        Promise.all(selectedRowKeys.map(key => PostService.post_delete(Number(key))))
            .then(() => {
                messageApi.success('批量删除成功');
                setSelectedRowKeys([]);
                getDataList();
            })
            .finally(() => {
                setLoading(false);
            });
    };

    const columns: TableProps<Post>['columns'] = [
        {
            title: '标题',
            dataIndex: 'title',
            width: 200,
            key: 'title',
            render: (value, data) => (
                <a onClick={() => titleClick(data)} style={{ fontWeight: data.top_priority ? 'bold' : 'normal', color: '#e0e0e0' }}>
                    {value}
                </a>
            ),
        },
        {
            title: '作者',
            dataIndex: 'author',
            key: 'author',
            render: (value) => <span style={{ color: '#808080' }}>{value}</span>,
        },
        {
            title: '展示',
            dataIndex: 'is_view',
            width: 60,
            key: 'is_view',
            render: (is_view) => (
                <span>
                    {is_view ?
                        <EyeOutlined style={{ fontSize: '18px', color: '#10a37f' }} />
                        :
                        <EyeInvisibleOutlined style={{ fontSize: '18px', color: '#555555' }} />
                    }
                </span>
            ),
        },
        {
            title: '摘要',
            dataIndex: 'summary',
            ellipsis: true,
            key: 'summary',
            render: (value) => <span style={{ color: '#808080' }}>{value}</span>,
        },
        {
            title: '标签',
            key: 'tags',
            dataIndex: 'tags',
            render: (tags) => (
                <Space size="small">
                    {tags && tags.map((tag: PostTag) => (
                        <Tag key={getUuid()} style={{
                            background: '#0a0a0a',
                            border: '1px solid #333333',
                            color: '#808080',
                            borderRadius: 0,
                        }}>
                            {tag['name']}
                        </Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: '评论',
            dataIndex: 'disallow_comment',
            width: 80,
            key: 'disallow_comment',
            render: (disallow_comment) => (
                <Tag style={{
                    background: disallow_comment ? '#1a1a1a' : '#10a37f',
                    color: disallow_comment ? '#808080' : '#000000',
                    border: 'none',
                    borderRadius: 0,
                }}>
                    {disallow_comment ? '否' : '是'}
                </Tag>
            ),
        },
        {
            title: '加密',
            dataIndex: 'password',
            width: 80,
            key: 'password',
            render: (password) => (
                <Tag style={{
                    background: password ? '#1a1a1a' : '#000000',
                    color: password ? '#808080' : '#555555',
                    border: '1px solid #333333',
                    borderRadius: 0,
                }}>
                    {password ? '是' : '否'}
                </Tag>
            ),
        },
        {
            title: '置顶',
            dataIndex: 'top_priority',
            width: 80,
            key: 'top_priority',
            render: (top_priority) => (
                <Tag style={{
                    background: top_priority ? '#10a37f' : '#000000',
                    color: top_priority ? '#000000' : '#555555',
                    border: 'none',
                    borderRadius: 0,
                }}>
                    {top_priority ? '是' : '否'}
                </Tag>
            ),
        },
        {
            title: '创建时间',
            dataIndex: 'created_time',
            key: 'created_time',
            render: (created_time) => <span style={{ color: '#808080' }}>{formatDate(new Date(created_time))}</span>,
        },
        {
            title: '操作',
            key: 'action',
            width: 180,
            fixed: 'right',
            render: (_, record) => (
                <Space size="small">
                    <Button
                        type="primary"
                        icon={<EditOutlined />}
                        size="small"
                        onClick={() => navigate(`/article/edit/${record.id}`)}
                        style={{ borderRadius: 0, background: '#10a37f', border: 'none' }}
                    >
                        编辑
                    </Button>
                    <Popconfirm
                        title="确定要删除这篇文章吗？"
                        description="删除后将无法恢复"
                        onConfirm={() => handleDelete(record.id)}
                        okText="确定"
                        cancelText="取消"
                    >
                        <Button
                            danger
                            icon={<DeleteOutlined />}
                            size="small"
                            style={{ borderRadius: 0 }}
                        >
                            删除
                        </Button>
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

    const [postList, setPostList] = useState<Post[]>([]);

    useEffect(() => {
        getDataList();
    }, []);

    function getDataList() {
        setLoading(true);
        PostService.postListPage(pageInfoRef.current).then((result) => {
            const pageInfo: PageInfo = result.obj;
            pageInfoRef.current = pageInfo;
            setPostList([...pageInfo.list]);
            setLoading(false);
        });
    }

    const handleSearch = () => {
        pageInfoRef.current.page_num = 1;
        getDataList();
    };

    const handleReset = () => {
        setSearchParams({
            keyword: '',
            author: '',
            status: null
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

    return (
        <>
            {contextHolder}
            <div>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid #333333',
                }}>
                    <div style={{ color: '#e0e0e0', fontSize: '13px', fontWeight: 700 }}>
                        <span style={{ color: '#10a37f' }}>&gt;</span> 文章管理
                    </div>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => navigate('/article/new')}
                        style={{ borderRadius: 0, background: '#10a37f', border: 'none' }}
                    >
                        新建文章
                    </Button>
                </div>

                <div style={{ border: '1px solid #333333', padding: '16px', marginBottom: '16px', background: '#0a0a0a' }}>
                    <Row gutter={16} align="middle">
                        <Col span={8}>
                            <Search
                                placeholder="搜索标题或摘要"
                                value={searchParams.keyword}
                                onChange={(e) => setSearchParams({ ...searchParams, keyword: e.target.value })}
                                onSearch={handleSearch}
                                style={{ width: '100%' }}
                                prefix={<SearchOutlined style={{ color: '#555555' }} />}
                            />
                        </Col>
                        <Col span={6}>
                            <Input
                                placeholder="作者"
                                value={searchParams.author}
                                onChange={(e) => setSearchParams({ ...searchParams, author: e.target.value })}
                                style={{ background: '#000000', border: '1px solid #333333', color: '#e0e0e0' }}
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
                                <Option value={1}>已发布</Option>
                                <Option value={0}>未发布</Option>
                            </Select>
                        </Col>
                        <Col span={4}>
                            <Space>
                                <Button
                                    type="primary"
                                    icon={<SearchOutlined />}
                                    onClick={handleSearch}
                                    style={{ borderRadius: 0, background: '#10a37f', border: 'none' }}
                                >
                                    搜索
                                </Button>
                                <Button
                                    icon={<FilterOutlined />}
                                    onClick={handleReset}
                                    style={{ borderRadius: 0, border: '1px solid #333333', color: '#808080' }}
                                >
                                    重置
                                </Button>
                            </Space>
                        </Col>
                    </Row>
                </div>

                {selectedRowKeys.length > 0 && (
                    <div style={{ marginBottom: 16, padding: '8px 12px', background: '#0a0a0a', border: '1px solid #333333' }}>
                        <Space>
                            <span style={{ color: '#808080' }}>已选择 {selectedRowKeys.length} 项</span>
                            <Popconfirm
                                title="确定要批量删除这些文章吗？"
                                description="删除后将无法恢复"
                                onConfirm={handleBatchDelete}
                                okText="确定"
                                cancelText="取消"
                            >
                                <Button
                                    danger
                                    icon={<DeleteOutlined />}
                                    style={{ borderRadius: 0 }}
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
                        showTotal: (total) => `共 ${total} 篇文章`
                    }}
                    rowKey={(record) => record.id!}
                    dataSource={postList}
                    rowSelection={rowSelection}
                    scroll={{ x: 2000 }}
                    style={{ tableLayout: 'fixed' }}
                />
            </div>
        </>
    );
};