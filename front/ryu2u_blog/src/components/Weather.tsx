import { useState, useEffect } from 'react';

export function Weather() {
    const [weatherData, setWeatherData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // 使用免费的OpenWeatherMap Current Weather API获取南京天气
        const fetchWeather = async () => {
            try {
                // 注意：在实际项目中，应该将API密钥存储在环境变量中
                const apiKey = '0f514868231b462f0cc5edc01d2368fd';
                const city = 'Nanjing';
                // 使用免费的Current Weather API
                const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric&lang=zh_cn`;

                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error('天气数据获取失败');
                }
                
                const data = await response.json();
                setWeatherData(data);
                setLoading(false);
            } catch (err) {
                console.error('获取天气数据出错:', err);
                setLoading(false);
                throw new Error('天气数据获取失败');
            }
        };

        fetchWeather();
    }, []);

    // 根据天气状况返回对应的emoji
    const getWeatherEmoji = (weatherId: number) => {
        if (weatherId >= 200 && weatherId < 300) return '⛈️'; // 雷暴
        if (weatherId >= 300 && weatherId < 400) return '🌧️'; // 毛毛雨
        if (weatherId >= 500 && weatherId < 600) return '🌧️'; // 雨
        if (weatherId >= 600 && weatherId < 700) return '❄️'; // 雪
        if (weatherId >= 700 && weatherId < 800) return '🌫️'; // 大气条件
        if (weatherId === 800) return '☀️'; // 晴天
        if (weatherId > 800) return '☁️'; // 多云
        return '🌤️'; // 默认
    };

    if (loading) {
        return (
            <>
                <div className="card-widget">
                    <div className="user">
                        <div className="card-title">
                            近日天气
                        </div>
                        <div className="loading-container">
                            加载天气中...
                        </div>
                    </div>
                </div>
            </>
        );
    }

    if (error || !weatherData) {
        return (
            <>
                <div className="card-widget">
                    <div className="user">
                        <div className="card-title">
                            近日天气
                        </div>
                        <div className="error-container">
                            天气数据获取失败
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <div className="card-widget">
                <div className="user">
                    <div className="card-title">
                        南京天气
                    </div>
                    <div className="weather-content">
                        <div className="weather-info">
                            <div className="weather-icon">
                                {getWeatherEmoji((weatherData as any).weather[0].id)}
                            </div>
                            <div className="weather-details">
                                <div className="temperature">{Math.round((weatherData as any).main.temp)}°C</div>
                                <div className="description">{(weatherData as any).weather[0].description}</div>
                            </div>
                        </div>
                        <div className="weather-forecast">
                            <div className="forecast-item">
                                <div className="forecast-day">今天</div>
                                <div className="forecast-icon">{getWeatherEmoji((weatherData as any).weather[0].id)}</div>
                                <div className="forecast-temp">{Math.round((weatherData as any).main.temp)}°C</div>
                            </div>
                            <div className="forecast-item">
                                <div className="forecast-day">湿度</div>
                                <div className="forecast-icon">💧</div>
                                <div className="forecast-temp">{(weatherData as any).main.humidity}%</div>
                            </div>
                            <div className="forecast-item">
                                <div className="forecast-day">风力</div>
                                <div className="forecast-icon">💨</div>
                                <div className="forecast-temp">{(weatherData as any).wind.speed}m/s</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}