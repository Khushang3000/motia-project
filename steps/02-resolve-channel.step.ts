import {EventConfig} from 'motia'
import { z } from 'zod';


// STEP-2: converting yt channel(get it through state) to channelId through, using youtube data api.
export const config: EventConfig = {
    name: "ResolveChannel",
    type: "event",//type api doesn't exist for this one
    // path: "/submit",//path and method don't make sense in this one.
    // method: "POST",
    
    //now emits, emits an event which need to be triggered by something, which will be based on something, and it will be based on subscribe
    subscribes: ["yt.submit"],
    emits: ["yt.channel.resolved", "yt.channel.error"],
    
    
};

//here we don't have a request as this is an event and it's not handling the api.but we'll have the eventData.
export const handler = async (eventData: any, {emit, logger, state}:any )=>{
    let jobId: string | undefined;
    let email: string | undefined;

    try {
        // firstly let's get data through eventData.
        const data = eventData || {};//if no event data then make it an empty object, eventData is actually used to get the data throughout event emissions.
        
        
        jobId= data.jobId;
        email= data.email;

        const channel = data.channel;
        logger.info("Resolving Youtube Channel",{jobId, channel});

        const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
        if(!YOUTUBE_API_KEY){
            throw new Error("Youtube api key not configured.")
        }

        const jobData = await state.get(`job: ${jobId}`);
        await state.set(`job: ${jobId}`,{
            ...jobData,
            status: "Resolving Channel"
        })

        let channelId: string | null = null;
        let channelName: string = "";

        if(channel.startsWith('@')){//when user gave a handle
            const handle = channel.substring(1);//just remove the @ from the front and you get the channel name, now we'll have to craft a searchUrl based on that.

            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&key=${YOUTUBE_API_KEY}`;
            //you can even read about this in the docs.

            //once we have a url we can make a axios/fetch request to it.
            const searchResponse = await fetch(searchUrl);

            const searchData = await searchResponse.json();//read the docs of youtube apis to see what kind of data do we recieve.

            if(searchData.items && searchData.items.length > 0){
                channelId = searchData.items[0].snippet.channelId;
                channelName = searchData.items[0].snippet.title;
            }
        } else {
            // if someone is directly searching from the channel name.
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(channel)}&key=${YOUTUBE_API_KEY}`;
            //notice how here we didn't need handle, we directly passed channel

            const searchResponse = await fetch(searchUrl);

            const searchData = await searchResponse.json();
            //same steps as the handle case.
            if(searchData.items && searchData.items.length > 0){
                channelId = searchData.items[0].snippet.channelId;
                channelName = searchData.items[0].snippet.title;
            }//grabbing data.

        }

        if(!channelId){
            //it means that channel is not found
            logger.info("Channel not found",{channel})

            await state.set(`job: ${jobId}`,{
            ...jobData,
            status: "Failed",
            error: "Channel not found"
            
            })
            //if channelId was not found then we emit error
            await emit({
                topic: "yt.channel.error",
                data: {
                    jobId,
                    email,
                }
            })
            return;
        }

        //if we found the channel and data then we emit 
        await emit({
            topic: "yt.channel.resolved",
            data: {
                jobId,
                channelId,
                channelName,
                email,
            }
        })//now we have emitted an event, and also added the api keys in the env variables, btw, instead of openai api key we're using gemini,
        //now in next commit we'll work on the next step.
        // so now i have added the api key n stuff., also in the if statement above we weren't emitting anything before but now we are and also returning so that no other event emits.
        //now let's move to step 3.

        return;
        


    } catch (error: any) {
        logger.error("Error resolving channel",{
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
                error: 'Failed to resolve channel, please try again.'
            }
            //notice how we don't need to send the entire jobData everywhere, as we're using state, the jobData can be accessible anywhere through jobId.

        })
    }
}