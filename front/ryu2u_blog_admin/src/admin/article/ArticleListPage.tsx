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
                <a onClick={() => titleClick(data)} style={{ fontWeight: data.top_priority ? 'bold' : 'normal', color: 'var(--color-text)' }}>
                    {value}
                </a>
            ),
        },
        {
            title: '作者',
            dataIndex: 'author',
            key: 'author',
            render: (value) => <span style={{ color: 'var(--color-text-secondary)' }}>{value}</span>,
        },
        {
            title: '展示',
            dataIndex: 'is_view',
            width: 60,
            key: 'is_view',
            render: (is_view) => (
                <span>
                    {is_view ?
                        <EyeOutlined style={{ fontSize: '18px', color: 'var(--color-primary)' }} />
                        :
                        <EyeInvisibleOutlined style={{ fontSize: '18px', color: 'var(--color-text-muted)' }} />
                    }
                </span>
            ),
        },
        {
            title: '摘要',
            dataIndex: 'summary',
            ellipsis: true,
            key: 'summary',
            render: (value) => <span style={{ color: 'var(--color-text-secondary)' }}>{value}</span>,
        },
        {
            title: '标签',
            key: 'tags',
            dataIndex: 'tags',
            render: (tags) => (
                <Space size="small">
                    {tags && tags.map((tag: PostTag) => (
                        <Tag key={getUuid()} className="admin-tag">
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
                <Tag className={disallow_comment ? 'admin-tag' : 'admin-tag admin-tag--active'}>
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
                <Tag className="admin-tag">
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
                <Tag className={top_priority ? 'admin-tag admin-tag--active' : 'admin-tag'}>
                    {top_priority ? '是' : '否'}
                </Tag>
            ),
        },
        {
            title: '创建时间',
            dataIndex: 'created_time',
            key: 'created_time',
            render: (created_time) => <span style={{ color: 'var(--color-text-secondary)' }}>{formatDate(new Date(created_time))}</span>,
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
                    >
                        编辑
                    </Button>
                    <Popconfirm
                        title="确定要删除这篇文章吗？"
                        description="删除后将无法恢复"
                        onConfirm={() => handleDelete(record.id!)}
                        okText="确定"
                        cancelText="取消"
                    >
                        <Button
                            danger
                            icon={<DeleteOutlined />}
                            size="small"
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
                <div className="admin-page-head">
                    <h2 className="admin-page-title">文章管理</h2>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => navigate('/article/new')}
                    >
                        新建文章
                    </Button>
                </div>

                <div className="admin-filter-panel">
                    <Row gutter={16} align="middle">
                        <Col span={8}>
                            <Search
                                placeholder="搜索标题或摘要"
                                value={searchParams.keyword}
                                onChange={(e) => setSearchParams({ ...searchParams, keyword: e.target.value })}
                                onSearch={handleSearch}
                                style={{ width: '100%' }}
                                prefix={<SearchOutlined style={{ color: 'var(--color-text-muted)' }} />}
                            />
                        </Col>
                        <Col span={5}>
                            <Input
                                placeholder="作者"
                                value={searchParams.author}
                                onChange={(e) => setSearchParams({ ...searchParams, author: e.target.value })}
                            />
                        </Col>
                        <Col span={5}>
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
                        <Col flex="none">
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
