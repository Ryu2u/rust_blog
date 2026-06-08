import {Badge, Button, Col, Form, Image, Input, Modal, Popconfirm, Row, Space, Switch, Table, TableProps, Tag, message} from "antd";
import {useEffect, useRef, useState} from "react";
import {Moment, PageInfo} from "../../common/Structs";
import {formatDate} from "../../common/utils";
import {
    DeleteOutlined,
    EditOutlined,
    EnvironmentOutlined,
    EyeInvisibleOutlined,
    EyeOutlined,
    HeartOutlined,
    MessageOutlined,
    PlusOutlined,
    SearchOutlined
} from "@ant-design/icons";
import MomentService from "../../service/MomentService";

const {Search, TextArea} = Input;

interface SearchParams {
    keyword: string;
}

type MomentFormValues = {
    content: string;
    location?: string;
    images?: string;
    is_public: boolean;
};

function parseImageLines(value?: string): string[] {
    if (!value) {
        return [];
    }
    return value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
}

export function MomentsPage() {
    const pageInfoRef = useRef(new PageInfo());
    const [loading, setLoading] = useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [searchParams, setSearchParams] = useState<SearchParams>({ keyword: '' });
    const [messageApi, contextHolder] = message.useMessage();
    const [momentList, setMomentList] = useState<Moment[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMoment, setEditingMoment] = useState<Moment | null>(null);
    const [form] = Form.useForm<MomentFormValues>();

    useEffect(() => {
        getDataList();
    }, []);

    function getDataList(keyword = searchParams.keyword) {
        setLoading(true);
        MomentService.momentListPage({
            page_num: pageInfoRef.current.page_num,
            page_size: pageInfoRef.current.page_size,
            keyword: keyword || undefined,
        }).then((res) => {
            const pageInfo: PageInfo = res.obj;
            pageInfoRef.current = pageInfo;
            setMomentList(pageInfo.list || []);
        }).catch(() => {
            messageApi.error('获取说说列表失败');
        }).finally(() => {
            setLoading(false);
        });
    }

    const handleDelete = (id: number) => {
        setLoading(true);
        MomentService.moment_delete(id).then((res) => {
            messageApi.success(res.msg || '删除成功');
            getDataList();
        }).catch(() => {
            setLoading(false);
        });
    };

    const handleTogglePublic = (id: number) => {
        setLoading(true);
        MomentService.moment_toggle_public(id).then((res) => {
            messageApi.success(res.msg || '状态已更新');
            getDataList();
        }).catch(() => {
            setLoading(false);
        });
    };

    const handleBatchDelete = () => {
        if (selectedRowKeys.length === 0) {
            messageApi.warning('请选择要删除的说说');
            return;
        }
        setLoading(true);
        Promise.all(selectedRowKeys.map((key) => MomentService.moment_delete(Number(key))))
            .then(() => {
                setSelectedRowKeys([]);
                messageApi.success('批量删除成功');
                getDataList();
            })
            .catch(() => {
                setLoading(false);
            });
    };

    const showModal = (moment?: Moment) => {
        if (moment) {
            setEditingMoment(moment);
            form.setFieldsValue({
                content: moment.content,
                location: moment.location || '',
                images: (moment.images || []).join('\n'),
                is_public: moment.is_public === 1,
            });
        } else {
            setEditingMoment(null);
            form.resetFields();
            form.setFieldsValue({ is_public: true });
        }
        setIsModalOpen(true);
    };

    const handleModalOk = () => {
        form.validateFields().then((values) => {
            setLoading(true);
            const payload: Moment = {
                id: editingMoment?.id || 0,
                content: values.content,
                location: values.location || '',
                images: parseImageLines(values.images),
                is_public: values.is_public ? 1 : 0,
                likes: editingMoment?.likes || 0,
                comments: editingMoment?.comments || 0,
                created_time: editingMoment?.created_time || 0,
                update_time: editingMoment?.update_time,
            };

            const request = editingMoment
                ? MomentService.moment_update(payload)
                : MomentService.moment_add(payload);

            request.then((res) => {
                messageApi.success(res.msg || (editingMoment ? '更新成功' : '发布成功'));
                setIsModalOpen(false);
                getDataList();
            }).catch(() => {
                setLoading(false);
            });
        });
    };

    const columns: TableProps<Moment>['columns'] = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 60,
            render: (value) => <span style={{ color: '#555555' }}>{value}</span>,
        },
        {
            title: '说说内容',
            dataIndex: 'content',
            key: 'content',
            width: 380,
            render: (content, record) => (
                <div>
                    <div style={{ marginBottom: 8, whiteSpace: 'pre-wrap', color: '#e0e0e0' }}>{content}</div>
                    {record.images && record.images.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                            <Image.PreviewGroup>
                                <Space size="small" wrap>
                                    {record.images.slice(0, 3).map((img, index) => (
                                        <Image
                                            key={index}
                                            width={60}
                                            height={60}
                                            src={img}
                                            style={{ objectFit: 'cover', borderRadius: 0, border: '1px solid #333333' }}
                                        />
                                    ))}
                                </Space>
                            </Image.PreviewGroup>
                        </div>
                    )}
                    {record.location && (
                        <div style={{ marginTop: 8, color: '#555555', fontSize: 12 }}>
                            <EnvironmentOutlined style={{ marginRight: 4 }} />
                            {record.location}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: '状态',
            dataIndex: 'is_public',
            key: 'is_public',
            width: 100,
            render: (is_public) => (
                <Tag style={{
                    background: is_public === 1 ? '#10a37f' : '#1a1a1a',
                    color: is_public === 1 ? '#000000' : '#808080',
                    border: 'none',
                    borderRadius: 0,
                }}>
                    {is_public === 1 ? '公开' : '私密'}
                </Tag>
            ),
        },
        {
            title: '互动数据',
            key: 'interaction',
            width: 150,
            render: (_, record) => (
                <Space direction="vertical" size="small">
                    <Space>
                        <HeartOutlined style={{ color: '#555555' }} />
                        <span style={{ color: '#808080' }}>{record.likes}</span>
                    </Space>
                    <Space>
                        <MessageOutlined style={{ color: '#555555' }} />
                        <span style={{ color: '#808080' }}>{record.comments}</span>
                    </Space>
                </Space>
            ),
        },
        {
            title: '发布时间',
            dataIndex: 'created_time',
            key: 'created_time',
            width: 180,
            render: (created_time) => (
                <span style={{ color: '#808080' }}>
                    {created_time ? formatDate(new Date(created_time * 1000)) : '-'}
                </span>
            ),
        },
        {
            title: '操作',
            key: 'action',
            width: 220,
            fixed: 'right',
            render: (_, record) => (
                <Space size="small" wrap>
                    <Button
                        type="primary"
                        icon={<EditOutlined />}
                        size="small"
                        onClick={() => showModal(record)}
                        style={{ borderRadius: 0, background: '#10a37f', border: 'none' }}
                    >
                        编辑
                    </Button>
                    <Button
                        icon={record.is_public === 1 ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                        size="small"
                        onClick={() => handleTogglePublic(record.id)}
                        style={{ borderRadius: 0, border: '1px solid #333333', color: '#808080' }}
                    >
                        {record.is_public === 1 ? '私密' : '公开'}
                    </Button>
                    <Popconfirm
                        title="确定要删除这条说说吗？"
                        description="删除后将无法恢复"
                        onConfirm={() => handleDelete(record.id)}
                        okText="确定"
                        cancelText="取消"
                    >
                        <Button danger icon={<DeleteOutlined />} size="small" style={{ borderRadius: 0 }}>
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

    const handleSearch = () => {
        pageInfoRef.current.page_num = 1;
        getDataList();
    };

    const handleReset = () => {
        setSearchParams({ keyword: '' });
        pageInfoRef.current.page_num = 1;
        getDataList('');
    };

    const rowSelection = {
        selectedRowKeys,
        onChange: (keys: React.Key[]) => {
            setSelectedRowKeys(keys);
        },
    };

    const publicCount = momentList.filter((m) => m.is_public === 1).length;
    const privateCount = momentList.filter((m) => m.is_public === 0).length;
    const totalLikes = momentList.reduce((sum, m) => sum + m.likes, 0);
    const totalComments = momentList.reduce((sum, m) => sum + m.comments, 0);

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
                        <span style={{ color: '#10a37f' }}>&gt;</span> 说说管理
                    </div>
                    <Space size="large">
                        <Space size="middle">
                            <Badge count={publicCount} showZero style={{ background: '#10a37f', color: '#000000' }}>
                                <Tag style={{ background: '#0a0a0a', color: '#10a37f', border: '1px solid #10a37f', borderRadius: 0 }}>公开</Tag>
                            </Badge>
                            <Badge count={privateCount} showZero style={{ background: '#1a1a1a', color: '#808080' }}>
                                <Tag style={{ background: '#1a1a1a', color: '#808080', border: '1px solid #333333', borderRadius: 0 }}>私密</Tag>
                            </Badge>
                        </Space>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => showModal()}
                            style={{ borderRadius: 0, background: '#10a37f', border: 'none' }}
                        >
                            发布说说
                        </Button>
                    </Space>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '1px',
                    background: '#333333',
                    border: '1px solid #333333',
                    marginBottom: '16px',
                }}>
                    {[
                        { label: '总说说', value: pageInfoRef.current.total },
                        { label: '公开', value: publicCount },
                        { label: '点赞', value: totalLikes },
                        { label: '评论', value: totalComments },
                    ].map((stat) => (
                        <div key={stat.label} style={{ background: '#000000', padding: '16px', textAlign: 'center' }}>
                            <div style={{ color: '#555555', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase' }}>
                                {stat.label}
                            </div>
                            <div style={{ color: '#10a37f', fontSize: '20px', fontWeight: 700, fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace" }}>
                                {stat.value}
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ border: '1px solid #333333', padding: '16px', marginBottom: '16px', background: '#0a0a0a' }}>
                    <Row gutter={16} align="middle">
                        <Col span={18}>
                            <Search
                                placeholder="搜索说说内容"
                                value={searchParams.keyword}
                                onChange={(e) => setSearchParams({ keyword: e.target.value })}
                                onSearch={handleSearch}
                                style={{ width: '100%' }}
                                prefix={<SearchOutlined style={{ color: '#555555' }} />}
                            />
                        </Col>
                        <Col span={6}>
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
                                title="确定要批量删除这些说说吗？"
                                description="删除后将无法恢复"
                                onConfirm={handleBatchDelete}
                                okText="确定"
                                cancelText="取消"
                            >
                                <Button danger icon={<DeleteOutlined />} style={{ borderRadius: 0 }}>
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
                        current: pageInfoRef.current.page_num,
                        pageSize: pageInfoRef.current.page_size,
                        onChange: paginationChange,
                        total: pageInfoRef.current.total,
                        showTotal: (total) => `共 ${total} 条说说`
                    }}
                    rowKey={(record) => record.id}
                    dataSource={momentList}
                    rowSelection={rowSelection}
                    scroll={{ x: 1200 }}
                />
            </div>

            <Modal
                title={editingMoment ? '编辑说说' : '发布说说'}
                open={isModalOpen}
                onOk={handleModalOk}
                onCancel={() => setIsModalOpen(false)}
                width={640}
                okText="确定"
                cancelText="取消"
                confirmLoading={loading}
                style={{ top: 20 }}
            >
                <Form form={form} layout="vertical" initialValues={{ is_public: true }}>
                    <Form.Item
                        label="说说内容"
                        name="content"
                        rules={[{ required: true, message: '请输入说说内容' }]}
                    >
                        <TextArea
                            rows={6}
                            placeholder="分享你的想法..."
                            maxLength={500}
                            showCount
                            style={{ background: '#000000', border: '1px solid #333333', color: '#e0e0e0', borderRadius: 0 }}
                        />
                    </Form.Item>
                    <Form.Item label="位置" name="location">
                        <Input
                            prefix={<EnvironmentOutlined style={{ color: '#555555' }} />}
                            placeholder="你在哪里？（可选）"
                            style={{ background: '#000000', border: '1px solid #333333', color: '#e0e0e0', borderRadius: 0 }}
                        />
                    </Form.Item>
                    <Form.Item
                        label="图片地址"
                        name="images"
                        extra="每行填写一个图片 URL，可为空"
                    >
                        <TextArea
                            rows={4}
                            placeholder={"https://example.com/1.jpg\nhttps://example.com/2.jpg"}
                            style={{ background: '#000000', border: '1px solid #333333', color: '#e0e0e0', borderRadius: 0 }}
                        />
                    </Form.Item>
                    <Form.Item label="公开设置" name="is_public" valuePropName="checked">
                        <Switch checkedChildren="公开" unCheckedChildren="私密" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}
