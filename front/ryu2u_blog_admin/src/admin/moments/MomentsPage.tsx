import { Table, TableProps, Tag, Input, Button, Space, Card, Row, Col, Popconfirm, message, Image, Modal, Form, Switch, Badge } from "antd";
import { useEffect, useRef, useState } from "react";
import { PageInfo, Moment } from "../../common/Structs";
import MomentService from "../../service/MomentService";
import { formatDate } from "../../common/utils";
import { SearchOutlined, DeleteOutlined, EditOutlined, PlusOutlined, EyeOutlined, EyeInvisibleOutlined, EnvironmentOutlined, HeartOutlined, MessageOutlined, PictureOutlined } from "@ant-design/icons";

const { Search } = Input;
const { TextArea } = Input;

interface SearchParams {
    keyword: string;
}

export function MomentsPage() {
    const pageInfoRef = useRef(new PageInfo());
    const [loading, setLoading] = useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [searchParams, setSearchParams] = useState<SearchParams>({
        keyword: ''
    });
    const [messageApi, contextHolder] = message.useMessage();
    const [momentList, setMomentList] = useState<Moment[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMoment, setEditingMoment] = useState<Moment | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        getDataList();
    }, []);

    function getDataList() {
        setLoading(true);
        // 模拟数据加载
        setTimeout(() => {
            const mockData: Moment[] = [
                {
                    id: 1,
                    content: '今天天气真好，出去散步心情愉悦 ☀️',
                    images: ['https://via.placeholder.com/300', 'https://via.placeholder.com/300/0000FF'],
                    is_public: 1,
                    location: '北京·朝阳公园',
                    likes: 128,
                    comments: 23,
                    created_time: Date.now() - 2 * 60 * 60 * 1000,
                },
                {
                    id: 2,
                    content: '分享一段代码，希望对大家有帮助。记录学习的每一天，坚持就是胜利！💪',
                    images: [],
                    is_public: 1,
                    location: '',
                    likes: 89,
                    comments: 15,
                    created_time: Date.now() - 5 * 60 * 60 * 1000,
                },
                {
                    id: 3,
                    content: '私密说说，只有自己可见',
                    images: ['https://via.placeholder.com/300/FF0000'],
                    is_public: 0,
                    location: '上海',
                    likes: 0,
                    comments: 0,
                    created_time: Date.now() - 24 * 60 * 60 * 1000,
                },
                {
                    id: 4,
                    content: '周末愉快！享受美好时光 🎉🎊',
                    images: ['https://via.placeholder.com/300/00FF00', 'https://via.placeholder.com/300/FFFF00', 'https://via.placeholder.com/300/FF00FF'],
                    is_public: 1,
                    location: '深圳·欢乐谷',
                    likes: 256,
                    comments: 47,
                    created_time: Date.now() - 48 * 60 * 60 * 1000,
                },
                {
                    id: 5,
                    content: '夜深人静，适合思考人生',
                    images: [],
                    is_public: 1,
                    location: '',
                    likes: 45,
                    comments: 8,
                    created_time: Date.now() - 72 * 60 * 60 * 1000,
                }
            ];
            
            pageInfoRef.current.total = mockData.length;
            pageInfoRef.current.list = mockData;
            setMomentList(mockData);
            setLoading(false);
        }, 500);
    }

    const handleDelete = (id: number) => {
        setLoading(true);
        setTimeout(() => {
            setMomentList(momentList.filter(moment => moment.id !== id));
            messageApi.success('删除成功');
            setLoading(false);
        }, 300);
    };

    const handleTogglePublic = (id: number) => {
        setLoading(true);
        setTimeout(() => {
            setMomentList(momentList.map(moment => 
                moment.id === id ? { ...moment, is_public: moment.is_public === 1 ? 0 : 1 } : moment
            ));
            messageApi.success('状态已更新');
            setLoading(false);
        }, 300);
    };

    const handleBatchDelete = () => {
        if (selectedRowKeys.length === 0) {
            messageApi.warning('请选择要删除的说说');
            return;
        }
        setLoading(true);
        setTimeout(() => {
            setMomentList(momentList.filter(moment => !selectedRowKeys.includes(moment.id)));
            setSelectedRowKeys([]);
            messageApi.success('批量删除成功');
            setLoading(false);
        }, 300);
    };

    const showModal = (moment?: Moment) => {
        if (moment) {
            setEditingMoment(moment);
            form.setFieldsValue({
                content: moment.content,
                location: moment.location,
                is_public: moment.is_public === 1
            });
        } else {
            setEditingMoment(null);
            form.resetFields();
        }
        setIsModalOpen(true);
    };

    const handleModalOk = () => {
        form.validateFields().then(values => {
            setLoading(true);
            setTimeout(() => {
                if (editingMoment) {
                    // 编辑
                    setMomentList(momentList.map(moment => 
                        moment.id === editingMoment.id 
                            ? { ...moment, ...values, is_public: values.is_public ? 1 : 0, update_time: Date.now() }
                            : moment
                    ));
                    messageApi.success('更新成功');
                } else {
                    // 新增
                    const newMoment: Moment = {
                        id: Date.now(),
                        content: values.content,
                        location: values.location || '',
                        is_public: values.is_public ? 1 : 0,
                        images: [],
                        likes: 0,
                        comments: 0,
                        created_time: Date.now()
                    };
                    setMomentList([newMoment, ...momentList]);
                    messageApi.success('发布成功');
                }
                setIsModalOpen(false);
                setLoading(false);
            }, 300);
        });
    };

    const handleModalCancel = () => {
        setIsModalOpen(false);
    };

    const columns: TableProps<Moment>['columns'] = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 60,
        },
        {
            title: '说说内容',
            dataIndex: 'content',
            key: 'content',
            width: 350,
            render: (content, record) => (
                <div>
                    <div style={{ marginBottom: 8, whiteSpace: 'pre-wrap' }}>{content}</div>
                    {record.images && record.images.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                            <Image.PreviewGroup>
                                <Space size="small">
                                    {record.images.slice(0, 3).map((img, index) => (
                                        <Image
                                            key={index}
                                            width={60}
                                            height={60}
                                            src={img}
                                            style={{ objectFit: 'cover', borderRadius: 4 }}
                                        />
                                    ))}
                                    {record.images.length > 3 && (
                                        <div style={{ 
                                            width: 60, 
                                            height: 60, 
                                            background: '#f0f0f0', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            borderRadius: 4
                                        }}>
                                            +{record.images.length - 3}
                                        </div>
                                    )}
                                </Space>
                            </Image.PreviewGroup>
                        </div>
                    )}
                    {record.location && (
                        <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
                            <EnvironmentOutlined /> {record.location}
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
                <Tag color={is_public === 1 ? 'green' : 'orange'} icon={is_public === 1 ? <EyeOutlined /> : <EyeInvisibleOutlined />}>
                    {is_public === 1 ? '公开' : '私密'}
                </Tag>
            ),
            filters: [
                { text: '公开', value: 1 },
                { text: '私密', value: 0 },
            ],
            onFilter: (value, record) => record.is_public === value,
        },
        {
            title: '互动数据',
            key: 'interaction',
            width: 150,
            render: (_, record) => (
                <Space direction="vertical" size="small">
                    <Space>
                        <HeartOutlined style={{ color: '#ff4d4f' }} />
                        <span>{record.likes} 点赞</span>
                    </Space>
                    <Space>
                        <MessageOutlined style={{ color: '#1890ff' }} />
                        <span>{record.comments} 评论</span>
                    </Space>
                </Space>
            ),
        },
        {
            title: '发布时间',
            dataIndex: 'created_time',
            key: 'created_time',
            width: 180,
            render: (created_time) => formatDate(new Date(created_time)),
            sorter: (a, b) => a.created_time - b.created_time,
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
                    >
                        编辑
                    </Button>
                    <Button 
                        icon={record.is_public === 1 ? <EyeInvisibleOutlined /> : <EyeOutlined />} 
                        size="small"
                        onClick={() => handleTogglePublic(record.id)}
                    >
                        {record.is_public === 1 ? '设为私密' : '设为公开'}
                    </Button>
                    <Popconfirm
                        title="确定要删除这条说说吗？"
                        description="删除后将无法恢复"
                        onConfirm={() => handleDelete(record.id)}
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

    const handleSearch = () => {
        pageInfoRef.current.page_num = 1;
        getDataList();
    };

    const handleReset = () => {
        setSearchParams({
            keyword: ''
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
    const publicCount = momentList.filter(m => m.is_public === 1).length;
    const privateCount = momentList.filter(m => m.is_public === 0).length;
    const totalLikes = momentList.reduce((sum, m) => sum + m.likes, 0);
    const totalComments = momentList.reduce((sum, m) => sum + m.comments, 0);

    return (
        <>
            {contextHolder}
            <Card>
                <Card 
                    title="说说管理" 
                    extra={
                        <Space size="large">
                            <Space size="middle">
                                <Badge count={publicCount} showZero>
                                    <Tag color="green" icon={<EyeOutlined />}>公开</Tag>
                                </Badge>
                                <Badge count={privateCount} showZero>
                                    <Tag color="orange" icon={<EyeInvisibleOutlined />}>私密</Tag>
                                </Badge>
                            </Space>
                            <Button 
                                type="primary" 
                                icon={<PlusOutlined />}
                                onClick={() => showModal()}
                            >
                                发布说说
                            </Button>
                        </Space>
                    }
                >
                    {/* 统计信息 */}
                    <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
                        <Row gutter={16}>
                            <Col span={6}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>{momentList.length}</div>
                                    <div style={{ color: '#999' }}>总说说数</div>
                                </div>
                            </Col>
                            <Col span={6}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>{publicCount}</div>
                                    <div style={{ color: '#999' }}>公开说说</div>
                                </div>
                            </Col>
                            <Col span={6}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#ff4d4f' }}>{totalLikes}</div>
                                    <div style={{ color: '#999' }}>总点赞数</div>
                                </div>
                            </Col>
                            <Col span={6}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#faad14' }}>{totalComments}</div>
                                    <div style={{ color: '#999' }}>总评论数</div>
                                </div>
                            </Col>
                        </Row>
                    </Card>

                    {/* 搜索 */}
                    <Card size="small" style={{ marginBottom: 16 }}>
                        <Row gutter={16} align="middle">
                            <Col span={18}>
                                <Search
                                    placeholder="搜索说说内容"
                                    value={searchParams.keyword}
                                    onChange={(e) => setSearchParams({ ...searchParams, keyword: e.target.value })}
                                    onSearch={handleSearch}
                                    style={{ width: '100%' }}
                                    prefix={<SearchOutlined />}
                                />
                            </Col>
                            <Col span={6}>
                                <Space>
                                    <Button 
                                        type="primary" 
                                        icon={<SearchOutlined />}
                                        onClick={handleSearch}
                                    >
                                        搜索
                                    </Button>
                                    <Button 
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
                                <Popconfirm
                                    title="确定要批量删除这些说说吗？"
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

                    {/* 说说列表 */}
                    <Table
                        loading={loading}
                        columns={columns}
                        pagination={{
                            showSizeChanger: true,
                            onChange: paginationChange,
                            total: pageInfoRef.current.total,
                            defaultPageSize: 10,
                            showTotal: (total) => `共 ${total} 条说说`
                        }}
                        rowKey={(record) => record.id}
                        dataSource={momentList}
                        rowSelection={rowSelection}
                        scroll={{ x: 1200 }}
                    />
                </Card>
            </Card>

            {/* 新增/编辑弹窗 */}
            <Modal
                title={editingMoment ? '编辑说说' : '发布说说'}
                open={isModalOpen}
                onOk={handleModalOk}
                onCancel={handleModalCancel}
                width={600}
                okText="确定"
                cancelText="取消"
            >
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{ is_public: true }}
                >
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
                        />
                    </Form.Item>
                    <Form.Item
                        label="位置"
                        name="location"
                    >
                        <Input 
                            prefix={<EnvironmentOutlined />} 
                            placeholder="你在哪里？（可选）" 
                        />
                    </Form.Item>
                    <Form.Item
                        label="公开设置"
                        name="is_public"
                        valuePropName="checked"
                    >
                        <Switch 
                            checkedChildren="公开" 
                            unCheckedChildren="私密" 
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}