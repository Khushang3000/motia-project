import {ApiRouteConfig} from 'motia'


// STEP-1: accept channel name and email to start the workflow.
export const config: ApiRouteConfig = {
    name: "submit-channel",
    type: "api",
    path: "/submit",
    method: "POST",
    // now once we get the data what kinda event do we emit so that other steps can listen to it. the event in our case is yt.submit
    // kinda like a pub-sub model(publisher-subscriber)
    // Publisher → produces and sends out messages (events, data updates, notifications).
    // Subscriber → listens for specific kinds of messages they care about.
    // Broker (or Message Bus) → the middleman that receives messages from publishers and delivers them to subscribers.
    emits: ['yt.submit']
};

interface SubmitRequest {
    channel: string;
    email: string;
}

//now we'll define a handler, which handles what happens with the data that we recieved. also in motia workbench, we use logger instead of console.log
//emit is responsible for emitting the events or listening for the events., state is for the data, like for modifying the state of the data or something else.
//state is basically a packet of the data which travels between multiple steps
//emit lets you broadcast some information for a particular step.
export const handler = async (req: any, {emit, logger, state}:any )=>{
    try {
        //instead of console.log we user logger in motia as it is closely integrated with the workbench or motia ui.
        logger.info("Recieved Submission Request", {
            body: req.body
        })

        const {channel, email} = req.body as SubmitRequest;

        if(!channel || !email) {
            return {
                status: 400,
                body: {
                error: "Missing required fields, channel and email"
                }//if you don't send any of the fields then we get this error. try just sending one field.
            }
        }

        // validation, we can also use zod for validation but we won't 
        const emailRegex = /^[^@]+@[^@]+\.[^@]+$/;//i got this regex from the internet.
        if(!emailRegex){
            return {
               status: 400,
                body: {
                error: "Invalid Email format"
            } 
            }
        }

        // now we have to create a jobId to keep a track of what job is currently going on. and this will be a uniqueid, we can get unique id from npm i uuid too. rn we're going with Date.now() which will obv make this unique.and some other stuff is applied as well
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2,9)}`;

        //now we have to set some info here which will help us create a queue in our application. we'll use state for this.
        await state.set(`job: ${jobId}`,{//this job will have this data.
            jobId,
            channel,
            email,
            status: "queued",
            createdAt: new Date().toISOString()
        })//now we have created a job
        logger.info("Job created", {jobId, channel, email});

        await emit({//when we emit/broadcast this event, name of the event is the topic, and the 2nd arg contains the data we send
            topic: "yt.submit",//make sure that this matches with the apiconfig interface we made.
            data: {
                jobId,//i'm providing jobId so that you can pick it up from the job queue
                channel,//easy for debugging as well as for more information
                email
            }
        })//now we're done with this handler and wanna return a response

        return {
            status: 201,
            body: {
                success: true,
                jobId,
                message: "Your request has been queued, you will get an email soon with improved suggestions for your youtube videos"
            }
        }//now after we added this subscriber, when we go to the motia workbench/tracing, we can see details like the state's data(remember state gets passed down in each step)
        //the job is created, it also emits a topic and i can listen for that topic(prolly later in the next step)
        //now in next commit we'll work on the step 2 of this application.
        // now in step2 we want to evaluate whether the channel exists or not, for that we'll have to call the youtube api, we can just install some packages from youtube, have a env variable, then prolly
        //so in this step youtube api is called and we'll emit event yt.channel.resolved.`
        //so see the env file and then go to the 02-resolve-channel.step.ts
    } catch (error: any) {
        logger.error('Error in Submission handler', {error: error.message})        
        return {
            status: 500,
            body: {
                error: "Internal Server Error"
            }
        }
    }
}
// now when you run motia and then send a post req through postman or httpie, you'll get an internal server error, saying there's no subscriber defined,(subscriber is what we return in handler function, earlier we weren't returning anything in the try block)
// it woulda also been there when you ran motia, but it's because we haven't fully written this step file yet. but our shi is working.
// you can see what happens with each request sent to your application through motia workbench, there you can see the request tracing and logs as well.
// every motia step file has a handler and config