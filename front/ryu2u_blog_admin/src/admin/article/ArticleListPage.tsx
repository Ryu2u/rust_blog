import './ArticlePage.scss'
import {Table, TableProps, Tag} from "antd";
import {useEffect, useRef, useState} from "react";
import {PageInfo, Post, PostTag} from "../../common/Structs";
import PostService from "../../service/PostService";
import {formatDate, getUuid} from "../../common/utils";
import {EyeInvisibleOutlined, EyeOutlined} from "@ant-design/icons";
import {useNavigate} from "react-router";


export const ArticleListPage = () => {

    const pageInfoRef = useRef(new PageInfo());
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const titleClick = (value: Post) => {
        console.log(value.id);
        navigate(`/article/edit/${value.id}`);
    }

    const columns: TableProps<Post>['columns'] = [
        {
            title: '标题',
            dataIndex: 'title',
            width: 200,
            key: 'title',
            // 分别为 当前行的值 ， 每一行的数据对象 和 索引
            render: (value, data, i) => <a key={getUuid()} onClick={() => titleClick(data)}>{value}</a>,
        },
        {
            title: '作者',
            dataIndex: 'author',
            key: 'author',
        },
        {
            title: '展示',
            dataIndex: 'is_view',
            key: 'is_view',
            render: (is_view) => <span key={getUuid()}>{is_view ?
                <span key={getUuid()} style={{fontSize: '25px'}}> <EyeOutlined/></span>
                :
                <span key={getUuid()} style={{fontSize: '25px'}}> <EyeInvisibleOutlined/> </span>
            }</span>
        },
        {
            title: '摘要',
            dataIndex: 'summary',
            width: 200,
            ellipsis: true,
            key: 'summary',
        },
        {
            title: ' 字数',
            dataIndex: 'word_count',
            key: 'word_count',
        },
        {
            title: '访问量',
            dataIndex: 'visits',
            key: 'visits',
        },
        {
            title: '标签',
            key: 'tags',
            dataIndex: 'tags',
            render: (tags) => (
                <>
                    {
                        tags
                        &&
                        tags.map((tag: PostTag) => {
                            return (
                                <Tag key={getUuid()} color={'volcano'}>
                                    {tag['name']}
                                </Tag>
                            );
                        })
                    }
                </>
            ),
        },
        {
            title: '允许评论',
            dataIndex: 'disallow_comment',
            key: 'disallow_comment',
            render: (disallow_comment, data, i) => <span key={getUuid()}>{disallow_comment ? '是' : '否'}</span>
        },
        {
            title: '加密',
            dataIndex: 'password',
            key: 'password',
            render: (password, data, i) => <span key={getUuid()}>{password ? '是' : '否'}</span>
        },
        {
            title: '置顶',
            dataIndex: 'top_priority',
            key: 'top_priority',
            render: (top_priority, data, i) => <span key={getUuid()}>{top_priority ? '是' : '否'}</span>
        },
        {
            title: '创建时间',
            dataIndex: 'created_time',
            key: 'created_time',
            render: (created_time, data, i) => <span key={getUuid()}>{formatDate(new Date(created_time))}</span>
        },
        {
            title: '更新时间',
            dataIndex: 'update_time',
            key: 'update_time',
            render: (update_time, data, i) => <span key={getUuid()}>{formatDate(new Date(update_time))}</span>
        },

    ];

    const paginationChange = (index: number, size: number) => {
        console.log(`index : ${index} size: ${size}`);
        pageInfoRef.current.page_num = index;
        pageInfoRef.current.page_size = size;
        getDataList();
    }

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

    return (
        <>
            <div>
                <Table
                    loading={loading}
                    columns={columns}
                    pagination={{
                        showSizeChanger: true,
                        onChange: paginationChange,
                        total: pageInfoRef.current.total,
                        defaultPageSize: 10
                    }}
                    rowKey={() => {
                        let uuid = getUuid();
                        return uuid;
                    }}
                    dataSource={postList}/>
            </div>
        </>
    );
};