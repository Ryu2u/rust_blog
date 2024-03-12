import './ArticlePage.scss'
import {Table, TableProps, Tag} from "antd";
import {useEffect, useRef, useState} from "react";
import {PageInfo, Post} from "../../common/Structs";
import PostService from "../../service/PostService";


export const ArticleListPage = () => {

    const pageInfoRef = useRef(new PageInfo());

    const titleClick = (value: string) => {
        console.log(value);
    }

    const columns: TableProps<Post>['columns'] = [
        {
            title: '标题',
            dataIndex: 'title',
            key: 'title',
            render: (text) => <a key={text} onClick={() => titleClick(text)}>{text}</a>,
        },
        {
            title: '作者',
            dataIndex: 'author',
            key: 'author',
        },
        {
            title: '是否展示',
            dataIndex: 'is_view',
            key: 'is_view',
            render: (is_view) => <span key={is_view}>{is_view ? '是' : '否'}</span>
        },
        {
            title: '摘要',
            dataIndex: 'summary',
            key: 'summary',
        },
        {
            title: ' 文章字符数',
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
            render: (_, {tags}) => (
                <>
                    {
                        tags
                        &&
                        tags.map((tag) => {
                            return (
                                <Tag color={'volcano'} key={tag}>
                                    {111}
                                </Tag>
                            );
                        })
                    }
                </>
            ),
        },
        {
            title: '是否允许评论',
            dataIndex: 'disallow_comment',
            key: 'disallow_comment',
        },
        {
            title: '是否加密',
            dataIndex: 'password',
            key: 'password',
            render: (password) => <span key={password}>{password ? '是' : '否'}</span>
        },
        {
            title: '是否置顶',
            dataIndex: 'top_priority',
            key: 'top_priority',
            // render: (top_priority) => <span >{top_priority ? '是' : '否'}</span>
        },
        {
            title: '创建时间',
            dataIndex: 'created_time',
            key: 'created_time',
            render: (created_time) => <span key={created_time}>{new Date(created_time).toLocaleString()}</span>
        }
        // {
        //     title: 'Action',
        //     key: 'action',
        //     render: (_, record) => (
        //         <Space size="middle">
        //             <a>Invite {record.name}</a>
        //             <a>Delete</a>
        //         </Space>
        //     ),
        // },
    ];

    const paginationChange = (index: number, size: number) => {
        console.log(`index : ${index} size: ${size}`);
        pageInfoRef.current.page_num = index;
        pageInfoRef.current.page_size = size;
    }

    const [postList, setPostList] = useState<Post[]>([]);

    useEffect(() => {
        PostService.postListPage(pageInfoRef.current).then((result) => {
            const pageInfo: PageInfo = result.obj;
            pageInfoRef.current = pageInfo;
            setPostList([...pageInfo.list]);
            console.log("list => ");
            console.log(postList);
        });

    }, []);

    return (
        <>
            <div>
                <Table columns={columns}
                       pagination={{
                           showSizeChanger: true,
                           onChange: paginationChange,
                           defaultPageSize: 10
                       }}
                       dataSource={postList}/>
            </div>
        </>
    );
};