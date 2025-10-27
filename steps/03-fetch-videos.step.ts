import {EventConfig} from 'motia'

// STEP-3: retrieves the latest 5 videos from the channelId resolved in the last step.

export const config: EventConfig = {
    name: "fetchVideos",
    type: "event",
    //now emits, emits an event which need to be triggered by something, which will be based on something, and it will be based on subscribe
    subscribes: ["yt.channel.resolved"],
    emits: ["yt.videos.fetched", "yt.videos.error"],
    
    
};

interface Video {
    videoId: string;
    title: string;
    Url: string;
    publishedAt: string;
    thumbnail: string;
}

export const handler = async (eventData: any, {emit, logger, state}:any )=>{
    
    let jobId: string | undefined;
    let email: string | undefined;



    try {
        
        const data = eventData || {};
        jobId= data.jobId;
        email= data.email;
        const channelId = data.channelId;
        const channelName = data.channelName;

        logger.info("Resolving Youtube Channel",{jobId, channelId});

        const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
        if(!YOUTUBE_API_KEY){
            throw new Error("Youtube api key not configured.")
        }

        const jobData = await state.get(`job: ${jobId}`);
        await state.set(`job: ${jobId}`,{
            ...jobData,
            status: "Fetching Videos"
        })

        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&type=video&maxResults=5&key=${YOUTUBE_API_KEY}` 
        // https://www.googleapis.com/<service>/v3/<endpoint>?param=value&param2=value
        // most google apis follow this pattern

        const response = await fetch(searchUrl);
        const youtubeData = await response.json();

        if(!youtubeData.items || youtubeData.items.length === 0){
            logger.warn("No videos found for channel",{jobId, channelId});
        
            await state.set(`job: ${jobId}`,{
                ...jobData,
                status: "Failed",
                error: "No videos found"
            })
            // emit a failure event
            await emit({
                topic: "yt.videos.error",
                data: {
                    jobId,
                    email,
                    error: "No videos found for this channel"
                }
            })

            //once done emitting the event then return
            return;

        }

        const videos: Video[] = youtubeData.itmes.map((item: any)=>(
            {
                //study docs for this
                videoId: item.id.videoId,
                title: item.snippet.title,
                url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                publishedAt: item.snippet.publishedAt,
                thumbnail: item.snippet.thumbnails.default.url
            }
        ))//now that we have the data we can put up the logger that hey we have the data.

        logger.info("Videos fetched successfully", {
            jobId,
            videoCount: videos.length
        })
        // now we just gotta update the state and emit the event of yt.videos.resolved.

        await state.set(`job: ${jobId}`,{
            ...jobData,
            status: "Videos fetched",
            // videos: videos
            videos
        })

        await emit({
            topic: "yt.videos.fetched",
            data: {
                jobId,
                channelName,
                videos,
                email,
            }
        })

        return;//we coulda not returned but there's no code below so anyways

        //now in next commit we'll work on the next step where gpt/gemini will generate the titles for us.

    } catch (error: any) {
        logger.error("Error fetching Videos",{
            error: error.message
        })
        // if there's no jobId or email, then we gotta write our custom errors
        if(!jobId || !email){
            logger.error("Cannot send error notification because we have a missing jobId or email")
            return 
        }

        const jobData = await state.get(`job: ${jobId}`)

        await state.set(`job: ${jobId}`,{
            ...jobData,//keep the previous jobdata same but since there's error here then, add status and error as well. we didn't do this in the previous step as previously we were just sending req res,
            // but this time we'll be emitting an event yt.channel.error
            status: 'Failed',
            error: error.message
        })

        await emit({
            topic: "yt.channel.error",
            data: {
                jobId,
                email,
                error: 'Failed to fetch videos, please try again later'
            }
            //notice how we don't need to send the entire jobData everywhere, as we're using state, the jobData can be accessible anywhere through jobId.

        })
    }
}