# Diego Meeting Transcript — September 25, 2026

Source: `Washington State University 2.m4a`  
Duration: 00:38:34  

## Attendees

| Name | Role | Talk time | Turns |
|---|---|---|---|
| Diego | Lab researcher | 00:24:50 | 166 |
| David | Student team | 00:07:05 | 165 |

## Transcript

**Diego** `00:00:00`  
[machine whirring] Okay, so we're gonna start then. Okay.

**David** `00:00:02`  
Okay.

**Diego** `00:00:02`  
So, let me show you. So, I don't know if you recall, but last time when we were talking with Asa, you know, he and Miles, like, besides explaining how this works and then how this, you know, um, like easy view plot the data. So, so this is, you know, one type of measurement, where we measure the CO₂ changes over time of a leaf sample that we, [object scraping] that we have it here. [horn honks] So this is our chamber, and basically this is where we take kind of like a disc, this leaf, and then we just put it there. Then we seal the system, and then we see the, the changes in CO₂.

**David** `00:00:41`  
Right.

**Diego** `00:00:41`  
And then that's what you basically... what, what we basically see, you know, over time. So that's one measurement, but then we are also, like, uh, coupling this, um, would be basically a, a light source, uh, that helps or that helps the plant to kind of do photosynthesis, you know, because this is a light source. So then, you know, once we have the sample here, then we just add this extra, uh, we call it a plexiglass or a rod, and then on top of that, we add this device. So basically, you know, the light is coming... [object drops] There are a couple of sensor, like LED lights here.

**David** `00:01:22`  
Mm-hmm.

**Diego** `00:01:22`  
I don't know if you can see it from here.

**David** `00:01:23`  
So, like, a little LED on the bottom?

**Diego** `00:01:25`  
Yes, LED.

**David** `00:01:26`  
Yeah.

**Diego** `00:01:26`  
So, and then, you know, this is the guide light, and then basically, you know, points toward the, the leaf sample that is here. [machine whirring] So then that's how it works. And then to control this device or to turn it on and, you know, to, to change the intensity or, like, the, the period and et cetera, we use this Python code that basically, you know, controls everything. Like, o- only the device, this device. Okay? So, I mean, this was developed by the person who designed this, okay? So basically, we don't... I guess we didn't change any of these. Like, I don't know what is this, honestly.

**David** `00:02:04`  
Okay.

**Diego** `00:02:04`  
You probably understand better than me.

**David** `00:02:05`  
Sure.

**Diego** `00:02:06`  
But it's just, you know, a bunch of, I guess, commands that tell, you know, what to do, uh, when to turn on, when to turn off, and all of that. So, you know, we just run this every time that we wanna use it at the beginning, you know, make sure that everything is working. It's just telling us, you know, which ports are, like, connected to this device. And then we use two. So this one is the one that controls the LED, uh, light, and then this other board, this one controls, I would say, I think it's, it's what provides the energy or something like that. But basically, we use these two, uh, USB cables, and then, [object drops] you know, they are connected to this USB dock, and then, you know, it is connected to my laptop.

**David** `00:02:50`  
Right, okay.

**Diego** `00:02:51`  
So my laptop is providing the... it is the energy source for this equipment.

**David** `00:02:55`  
Gotcha. Okay.

**Diego** `00:02:56`  
Okay? So then, you know, here I'm just checking, you know, that, uh, both device are connected. Then just move on. Uh, we're gonna double-check everything and just run the code, basically. [machine whirring] And then this part is basically where we kind of, um, where we can change the settings. Like, you know, what light density do we wanna use, uh, like the period, you know, for how long, et cetera. So we do that, you know, and then at some point, once we, uh, I guess, have the final protocol, then what we do basically, let's say we name it, like, protocol two, then we just go, scroll down all the way to this part, like here. So here is, you know, is where I'm gonna write, like, the name of my protocol, either two, three, or whatever number I gave it.

**David** `00:03:46`  
Mm-hmm.

**Diego** `00:03:47`  
And then I paste it here, or I copy and paste it here, and then I run this, and then this will basically, like, turn on, and then it will run the protocol that I designed.

**David** `00:03:57`  
Okay.

**Diego** `00:03:58`  
Okay? So just, uh, an example. For instance, I, I have... I've been using this protocol number two, and then when I, uh, click here, you'll see a nice number. Okay? And then-

**David** `00:04:09`  
So that's how you control the intensity and the setting of the device?

**Diego** `00:04:11`  
Yes, every-- Yeah. In this protocol, I already, like, you know, establish, uh, what time, for how long, what light intensity, if it's gonna be, like, during the whole time or I wanna change it, you know, at, at specific times and so on. But basically, yeah, that's kinda like what I do when I've been testing. But this is how this, I guess, this device works, that is controlled by this Python code, and then we use a separate laptop, you know, to, to, to, to make it work. They were not using this.

**David** `00:04:39`  
[laughs] Okay. So, so what do you mean you use a, a separate laptop?

**Diego** `00:04:42`  
Like, I mean, it-

**David** `00:04:43`  
You mean this is just-

**Diego** `00:04:43`  
Yeah

**David** `00:04:43`  
... depending on the existing software?

**Diego** `00:04:45`  
Exactly, yeah.

**David** `00:04:45`  
Yeah.

**Diego** `00:04:45`  
It's not... That's... And that's why, I guess, we are trying to integrate these two measurements, because as how it is right now, it works.

**David** `00:04:54`  
Mm-hmm.

**Diego** `00:04:54`  
It's fine. But I think one of the things that at least, uh, I notice is that sometimes you have to babysit these devices, especially this. This one, you can just let it run, and it runs by itself.

**David** `00:05:08`  
Mm-hmm.

**Diego** `00:05:08`  
It's just registering, you know, all the data. But this one, you basically have to, you know... Every time that I need to turn it on, I need to run this. And then if I, if I want it, I don't know, to turn it off because something happened, I need to check the code and then see what's going on.

**David** `00:05:22`  
Gotcha. Okay.

**Diego** `00:05:23`  
So, but the thing is, you know, the fact that we have, like, these two, I guess, monitors, that one of them is recording the data of this device or, like, the mass spec, and then this one or this computer or whatever monitor we have here is, uh, recording the data from here. Like, I feel like it's not the ideal, I think, and that's why we wanna integrate this. So I don't know, this is just an idea, and I don't know how possible it is, but somehow if we can have, like, the data that we, uh, have here... Let me show you real quick. But basically, this is... Like, you know, once it's running, it's also showing me, like, on, on live, like, the plotting, like all the data that is collected.

**David** `00:06:04`  
Right, right.

**Diego** `00:06:05`  
So I guess- I wanna have, or I don't know, I wonder if it's possible to have this data, but in this software.

**David** `00:06:14`  
Yeah, absolutely it is. But, um, how are you storing information here? Is it in a CSV file?

**Diego** `00:06:20`  
Yeah, it's a CSV file.

**David** `00:06:21`  
It's in a CSV file?

**Diego** `00:06:21`  
I mean, I, I can modify that if I just have text file, CSV, Excel, whatever. But usually I just, you know, uh, like once it's done, I just, you know, uh, get the data as a CSV file.

**David** `00:06:33`  
Okay.

**Diego** `00:06:33`  
But it's kinda like the s-- I think the same approach a bit, right? Just the same approach.

**David** `00:06:37`  
Okay.

**Diego** `00:06:37`  
Uh, I think it just, as I said, because, you know, we, we both, like, measure-- We use these two devices to measure, like, or they're, uh, simultaneously measure something. I think it's better, it's better sometimes to just have them in a single monitor-

**David** `00:06:53`  
Sure

**Diego** `00:06:53`  
... so we can see this data plus that.

**David** `00:06:57`  
Okay.

**Diego** `00:06:57`  
And, yeah. So, but there are a couple of things that I noticed too. So as I told you, to make, like, to turn this on, we need this, you know, power source, in this case, from the, uh, from my laptop.

**David** `00:07:10`  
Okay.

**Diego** `00:07:11`  
So before, I tried to connect this to that CPU, but it wasn't working. So it was only able to detect one of the comms.

**David** `00:07:20`  
Mm-hmm.

**Diego** `00:07:21`  
And I think it's just probably a, like a hardware limitation also, that it doesn't provide, like, enough energy, you know, to supply, like, for this device.

**David** `00:07:29`  
That's controlling it.

**Diego** `00:07:30`  
Because it's also, you know, the-- supplying the energy, or I don't know, it's also connected to this one, so-

**David** `00:07:36`  
Okay

**Diego** `00:07:36`  
... I think that's one limitation. I don't know if it's possible to change that. I don't know. Uh, but yeah, that's something that I noticed. That's why I stopped using the, this CPU. Because I was, you know... At the beginning, my idea was, "Okay, I'll just divide, like, I don't know, the screen in two sides," you know.

**David** `00:07:50`  
Yeah.

**Diego** `00:07:50`  
One, I have this, and then the other one, I can have this. And, but I intro-- I even, like, installed the Python and... But yeah, it wasn't able to detect the other comm, so that-

**David** `00:08:01`  
What wasn't able to detect it? The, the script-

**Diego** `00:08:03`  
Like this-

**David** `00:08:03`  
... that you're running, or was it the actual-

**Diego** `00:08:04`  
No, like-

**David** `00:08:04`  
... operating system?

**Diego** `00:08:04`  
One of the... It was able to detect only one USB port.

**David** `00:08:08`  
Right. But the, the script or the operating system?

**Diego** `00:08:10`  
The script.

**David** `00:08:11`  
Okay.

**Diego** `00:08:12`  
Mm-hmm. So, like, as you can see this part, you know, before we run, we just need to make sure that both devices are connected, and this is how we can tell, oh, they are both connected.

**David** `00:08:25`  
Right.

**Diego** `00:08:26`  
But when I was working with the CPU, I was able to see only one of them.

**David** `00:08:30`  
Okay.

**Diego** `00:08:30`  
So then I wasn't able, you know, to turn it on.

**David** `00:08:32`  
Mm-hmm.

**Diego** `00:08:33`  
So, yeah, I think that was one of the limitations for using this one. Um, yeah, then, you know, I just decided, okay, I'll just, you know, use another laptop or my laptop or any other laptop that we have available. But yeah, so I guess that's one, one of the ideas that I think would be nice to explore, to have this Python code or, I guess, the plotting also in this one, or, I don't know, somehow have, you know, a single, let's say a single, uh, I don't know, this is an idea. [microphone feedback squeals] Like, for instance, there is like an extra option here that allows me, okay, start the protocol that I said. And then I can just click here and then, you know, see, like, all the data that is collected.

**David** `00:09:15`  
Gotcha. Okay.

**Diego** `00:09:17`  
So something like that, uh, as initial phase, I would say. So...

**David** `00:09:22`  
What about long term? What are your, your asks long term?

**Diego** `00:09:24`  
Well, long term, what we want is, like, you know, basically control, like, both the devices just by a single, the code.

**David** `00:09:32`  
Mm-hmm. Yeah.

**Diego** `00:09:33`  
Because right now, this one is being driven by a different code, and then this one is by this code. So then if we combine them in a single code, then I think we just-- we don't even need to use, you know, two laptops or I don't know. So just something like that.

**David** `00:09:47`  
Okay.

**Diego** `00:09:48`  
Um, but yeah, that's kind of, uh, one of the things that we would like to explore and see how doable it is.

**David** `00:10:00`  
Yeah, it's definitely doable. There, there's really not a lot of work from moving all of that functionality into that application. Um, do you have any other issues with, like, the existing scripts or existing software that you want taken care of?

**Diego** `00:10:14`  
Like in this one? Uh, I mean, not really. I mean, I mean, as I said, for all what is here is just, you know, what they built, and then I don't touch it. Uh, but I, I guess, you know, one of the things that makes this a little bit, uh, how can I say, like, not very user-friendly is that, as you can see here, like, I'm familiar with this because I know what's the meaning of the M, of the P.

**David** `00:10:41`  
Right.

**Diego** `00:10:41`  
But I think it would be nicer to have, like, for instance, kinda like this, you know, that is straightforward, that let's say, for instance, this, um, M is, uh, measurements, like how many measurements we wanna collect. So if I could set that, I don't know, like in a individual windows or with, you know, like another portion of the, the whole, uh, program where I can say, "Oh, I want this number." So just set it here instead of, you know, going to this code and then, um, like, you know, typing it or something like that.

**David** `00:11:12`  
Yeah. So you just want a user interface to-

**Diego** `00:11:14`  
Yeah-

**David** `00:11:14`  
... define that protocol

**Diego** `00:11:15`  
... make it more friendly. So, you know, someone can also, you know, access to it and it's more, I guess, easy to, to use instead of, "Oh, this is the meaning of this," and so on. But where there are so many instructions, you know, that at le-- I mean, I'm already familiar, but if someone wants to learn this, it will take some time. So... But if you have it, like, in this way, like more user-friendly, it would be easier to-

**David** `00:11:37`  
Mm-hmm

**Diego** `00:11:37`  
... to learn and to use it, so...

**David** `00:11:39`  
Sure.

**Diego** `00:11:40`  
So yeah, that's one of the things probably that would be also nice to improve, like this code, uh, because as I said, we just use the Python to do all the modifications. While in this one, you-- we're not doing an- anything in the Python. We're just doing the modification up here. So that is something that, you know, would be, uh, interesting to do. Um, then-

**David** `00:12:02`  
What about the, what about the way that you're defining these protocols? Like, are you okay writing- -arrays like this, or would you prefer just a simple form in plain English that stores them? Do you need to store them at all? Maybe you reuse protocols?

**Diego** `00:12:13`  
You mean, uh, yeah. No, no. Yeah, I reuse them. Yeah. I reuse. Yeah. Yeah. I mean, well, in my case I gain the, you know, numbers like one, two, and so on. But yeah, I mean, yeah, you store them. Well, they are stored here, you know.

**David** `00:12:24`  
Okay. Right.

**Diego** `00:12:24`  
They're already in this code. I just type them. But yeah, there are-- I have so many, like fifty-one, two. But yeah, well, they are here, all of them. I just basically change the number that I wanna test, like in this, like in this portion, and I just run it like that.

**David** `00:12:44`  
Yeah. Cool. And so with this data, whenever you finish running the experiment and you collect your CSV files-

**Diego** `00:12:49`  
Yeah

**David** `00:12:49`  
...do you happen to move this data from this computer onto this one, or, or to do somewhere else and do some kind of, like, analytics work, or?

**Diego** `00:12:54`  
Yeah, yeah. I mean, well, then after, you know, I, I do, uh-- Yeah, I mean, we do a lot of analysis. I don't know, like bar plots, you know, any kind of analysis. But yeah, I retrieve the CSV file, plus the CSV file of this, and then I combine them both.

**David** `00:13:08`  
Mm-hmm.

**Diego** `00:13:09`  
So I guess that's another thing, for instance, that, like, I do that manually. [object scraping] [machine whirring]

**David** `00:13:15`  
Right. That's okay. [chuckling]

**Diego** `00:13:15`  
So I do that, like, manually. Like, you know, I kind of-- So for instance, let's say here. Yeah, this is the time, yeah? And then this one, also the X-axis is, is plot of time. So then I kind of take notes. Okay, I'm starting at this point, which let's say for-- let's say this is like four hundred and sixty seconds. And then I know that, that this is where my sample start, and then [machine beeping] this is kind of my end for me. So it ends at four, I don't know, four, four thousand seven hundred, something like that. So I do that manually. But I think if, if we have, you know, this data, like coupled here, that you can see both at the same time, then probably I don't need to write when I'm starting and when it's done. Because, you know, once this is off, this is gonna stop, like, plotting data. While this one is, it will just plotting until I stop it.

**David** `00:14:11`  
Okay.

**Diego** `00:14:11`  
So I guess that's also, uh, one of, uh, the limitations of having these two devices, like, in separate, like, monitors. So, yeah.

**David** `00:14:24`  
Okay. And so you wanna be able to visualize both of the information at the same time?

**Diego** `00:14:29`  
Yeah. Let me show you, uh, how .

**David** `00:14:34`  
So whenever you-- I mean, so you mentioned that you, you create, like, bar charts and then you do analytics with the information. Whenever you do that, are you doing that through something like Excel? Are you using, like, SQL or R?

**Diego** `00:14:42`  
I mean, I use R, Python, any-

**David** `00:14:45`  
Oh, okay.

**Diego** `00:14:46`  
Sometimes Excel if I just wanna do something quickly.

**David** `00:14:49`  
Is there, is there a need for it to be in a CSV file, or do you need to have a way to export it to a CSV file?

**Diego** `00:14:55`  
I mean, I'm used to it, honestly. Um-

**David** `00:14:56`  
Mm-hmm.

**Diego** `00:14:57`  
-I, um, it's not a requirement. Sometimes I do a text file, so, yeah. Uh, let me show you how . [machine whirring] Like this. So, um... [machine whirring] Okay, so this is just for a single sample, like one sample, the data that I collected from this part. [machine beeping] Basically, it's kind of I'm taking only this portion, and that's why I'm telling you, I write down, okay, I just started at four hundred and something, and then I'm ending at four hundred seven thousand, or four thousand seven hundred. And that's one of my samples. And then, you know, once I'm done with everything, then I go manually basically in the Excel and then look for four thousand and something to, let's say, five thousand. And then that's sample one. And then I get the data, and then this is just for a single sample. But then as, as I, as I said before, like during this time, I'm also measuring the, the fluorescence that is coming from this device. [machine beeping] And then that's basically the data, the data that I have.

**David** `00:16:28`  
Okay.

**Diego** `00:16:30`  
So the-- Like, I guess that's what I'm saying, you know. At the end we're trying basically to couple these two, no? I mean, we want to couple. But the fact that I'm doing this manually is because I don't have this on top of this, you know?

**David** `00:16:45`  
Yeah.

**Diego** `00:16:45`  
So then I feel like if I have a plot that is plotting this plus this in the same plot-

**David** `00:16:53`  
Mm-hmm

**Diego** `00:16:53`  
...I-- Uh, probably it's gonna be way easier for me to identify, like, my starting point and the end point for a single sample. And then, you know, for the other sample and so on, until I'm done with the measurements. So, um, yeah, that's one of the things, like, takes a lot of time just to... Not even to do analysis, just to identify what is my sample one, what is my sample two, and so on. And then I do, okay, let's do whatever analysis we need to do.

**David** `00:17:19`  
Okay, so just aggregating data is a lot of work.

**Diego** `00:17:21`  
Yeah, it takes a lot. So I mean, I know there are ways to do in Python and other, but yeah, I mean, it just, I think it takes time and probably I'm not very experienced to do it. So I'm, I don't know if I, um... I mean, yeah, in the way that I'm doing works for me for now, you know?

**David** `00:17:35`  
Mm-hmm.

**Diego** `00:17:35`  
But I think if there is something that can improve is this, like by combining it, I think it will be easier, uh, and not spending a lot of time to just identify where did I start number one, then where is number two and so on.

**David** `00:17:49`  
Yeah. So I mean, there's, like, a couple of ways to do it. I mean, we could keep the information as a CSV and then store it all in the same computer, and then you could find a way to aggregate it there.

**Diego** `00:17:57`  
Mm-hmm.

**David** `00:17:57`  
But like you mentioned, you're familiar with R and Python. Um, we could potentially make it so that you would be able to plot all of this information just by writing a simple Python or R script. And you wouldn't have to do any data aggregation because you would have some sort of underlying engine to take care of that for you.

**Diego** `00:18:12`  
Yeah.

**David** `00:18:12`  
So if you're okay with writing Python or R for, like, these analytical purposes, that's probably the best thing that we could do to help you out with that. I don't know.

**Diego** `00:18:20`  
Yeah, yeah. No, no. But I guess, you know, as I said before, like, I think, like, you know, this is the ne-- that's-- this is how we have it right now, right?

**David** `00:18:31`  
Mm-hmm.

**Diego** `00:18:31`  
But I think if, like, here I'm able to see also this data-

**David** `00:18:37`  
Mm-hmm

**Diego** `00:18:38`  
... here, I think I'm gonna very-- I think it's gonna be way easier for me to identify where is my data.

**David** `00:18:43`  
You think that's better?

**Diego** `00:18:43`  
Yeah, I think. And I mean, that- that's also what we want. So I guess one of my questions that I, I've been wondering is, like, would it be easier to have, for instance, a plot or, like, two plots. One plot that is only, you know, getting the data, which is like this. And then let's say another plot that is plotting this data from this device. Or have both data in a single plot. So I guess, you know, because the time is the same for both, in this case, the X axis is gonna be different, but I don't know, if we add, like, a third axis that is plotting that data, then I don't know if that would make it better in terms of visualization or, or is it gonna, I don't know, is it gonna crash the, [chuckling] the, the computer? I don't know.

**David** `00:19:29`  
Yeah. So it ca-- it depends on, like, the specifications of the, uh, the hardware that we're using. Um, but what you're asking for is really trivial. If you just want an extra plot here and you already have an axis for time, it's really easy to put that information in this plot. It's qui- quite literally a couple of lines of code.

**Diego** `00:19:42`  
Okay.

**David** `00:19:43`  
So, so that's really something that we can do. The, the question is what do you-- how do you wanna use it? What do you want exactly, right?

**Diego** `00:19:50`  
Yeah.

**David** `00:19:50`  
We really have limitations to how we can display the data and in what order and what fashion. And that's more so what works best for you to help you out.

**Diego** `00:19:56`  
Okay. I mean, no, that would-- I mean, if I have it in a single plot, I think, honestly... Because at the end, that's what I do.

**David** `00:20:03`  
Yeah.

**Diego** `00:20:03`  
I, I, I have-- at the end, I combine them both and then I see, oh, okay, that's where it starts, that's where it ends or something like that.

**David** `00:20:09`  
Mm-hmm.

**Diego** `00:20:09`  
Uh, but I guess another thing that, uh, like one difference between this code and this one is that I-- like, the frequency, like the-- of, like, how many points takes per, I don't know, per second or per minute is different compared to this one. And I think, I don't, I don't know if it's possible to match, like, you know, the frequency of these two devices. I don't know.

**David** `00:20:31`  
So the, the amount of da- data that you're collecting, like, for a given amount of time is completely different from this one?

**Diego** `00:20:36`  
Yes, because in this one, I'm going, like, every zero point one second.

**David** `00:20:39`  
Mm-hmm.

**Diego** `00:20:40`  
And this one, I think we're going every zero point five seconds.

**David** `00:20:43`  
Right.

**Diego** `00:20:43`  
And I can even, like, go way faster, you know, zero point zero one. That allows me, and that, that's what I want.

**David** `00:20:49`  
Mm-hmm.

**Diego** `00:20:49`  
And, but I don't know, you know, because the scale is gonna be very short, I don't know, especially for this one, I don't know if it's gonna create some weird, uh, visualization or not. Or I don't know if it's, if it's even possible to integrate them both in the same plot.

**David** `00:21:05`  
It would be possible. And I mean, um, even if that was an issue, we could do some kind of downsampling in, in the bigger plot and then give you a more, uh, granular, smaller plot on the side that lets you see-

**Diego** `00:21:15`  
Okay

**David** `00:21:16`  
... in more depth. But we could do both. Um, I haven't read the, the code for how we're actually downsampling this information here, because I know it's not one to one whenever you're collecting that. But, um, yeah, we'll take a look into that. It seems doable.

**Diego** `00:21:29`  
Because when I get the CSV from this one, it's, uh, it's like every zero point five seconds.

**David** `00:21:35`  
Yeah. Yeah.

**Diego** `00:21:36`  
Yeah.

**David** `00:21:36`  
Zero point five seconds.

**Diego** `00:21:38`  
I think it's even, like, it's taking, like, more data, but I think it just does, like, a regression analysis and then identify, okay, zero point five. That's what it's doing, I think.

**David** `00:21:47`  
Yeah.

**Diego** `00:21:47`  
Um, but yeah, um... Yeah, I think that's pretty much, um... Because, you know, one of the things that... So this is the raw data of these devices.

**David** `00:22:09`  
Right.

**Diego** `00:22:09`  
But at the end, this is not what we want. Like, what we, uh, want actually is... Yeah, but it's basically this. You see these small, uh, dots? This is, like, the final data that we collect based on that raw data. And that's basically what we actually, you know, look for.

**David** `00:22:38`  
Okay.

**Diego** `00:22:39`  
But, I mean, it is, like, some calculations. Uh, I think that's also doable. But ideally, what we, what we usually do is, like, you know, once we have this and then once we transform this into those single data points, like, we can see the bunch of data points, one point here and the other here, and so on and so on. We can see the kinetics-

**David** `00:22:59`  
Right

**Diego** `00:22:59`  
... across time.

**David** `00:23:01`  
So is there a reason that that-- we use-- like, the ultimate, uh, data collection that you showed me, is that something that needs to be in the software too? Or is that something that has to be done by hand?

**Diego** `00:23:11`  
Like, what, what do you mean?

**David** `00:23:13`  
I mean, did you calculate that through the same methods that you do, like, over here through the software?

**Diego** `00:23:16`  
Yeah, I mean, I-- no. Well, no, no, I do that by, like, you know, I run-- I have my code, my R or whatever, and then I just calculate those. Yeah.

**David** `00:23:22`  
Okay.

**Diego** `00:23:23`  
But again, you know, it takes time.

**David** `00:23:26`  
Yeah.

**Diego** `00:23:26`  
And I think we just wanna have that data, you know, when we retrieve it, that we have already the data calculated.

**David** `00:23:32`  
Right.

**Diego** `00:23:33`  
And yeah, so...

**David** `00:23:35`  
Okay.

**Diego** `00:23:35`  
Those, those kind of things. Um...

**David** `00:23:39`  
So how many of these controllers do you have? Do you only have these two devices here?

**Diego** `00:23:44`  
Well, yeah, we have one. This, yeah, because it's very in, like, caution, so [chuckling] this one is the only one-

**David** `00:23:49`  
Yeah

**Diego** `00:23:50`  
... that we have right now. Um, but yeah, that's, yeah, that's the only one. And yeah, that's pretty much it. I don't think we-

**David** `00:24:01`  
Okay. Would you be able to share the, the code with us, or is it proprietary or what?

**Diego** `00:24:04`  
I think so, yeah. I'll, I'll, I'll send Asa if I could. I think he's the one who's gonna share it with you. But I'll, I'll, I'll send it to him and I think he's gonna share it with you guys.

**David** `00:24:12`  
Okay, great. Yeah.

**Diego** `00:24:13`  
But-

**David** `00:24:14`  
Because I think that's the only thing that we're missing. Um, the other thing that I wanted to ask you is, do you have any concerns with storage? I know the last time that we were here, we went out to the other side, and you-- some-- uh, Asaf mentioned that you guys were having to migrate data onto different drives because you have so much information.

**Diego** `00:24:31`  
Mm-hmm.

**David** `00:24:31`  
Is that something that's happening with this one? Is it-

**Diego** `00:24:34`  
Not really. No, no, no. No, I-- but at least I didn't have. I didn't experience that.

**David** `00:24:38`  
Okay.

**Diego** `00:24:39`  
No, I didn't.

**David** `00:24:44`  
Okay. I think it's all pretty straightforward. I mean, yeah, everything that you're asking for is pretty reasonable. It's pretty easy to do in application code. Um...

**Diego** `00:24:52`  
But then, like, for instance, what do you think about what I told you, that, you know, this CPU is not allowed to detect, I don't know, like, multiple of these USB ports?

**David** `00:25:02`  
The thing is, is that, um, it, it could either be your USB hub or, or it could be, like you mentioned, like it could be the computer. I'm not entirely too sure. I don't have a lot of experience with hardware.

**Diego** `00:25:11`  
Yeah, yeah.

**David** `00:25:12`  
Um, but we could just, like, experiment that and take a look. I mean, but it looks like it's fine. It, it might just be the hardware 'cause otherwise you wouldn't be able to detect it if your USB hub was broken or if the controller-

**Diego** `00:25:22`  
Yeah, no, no. Yeah, mine works.

**David** `00:25:24`  
Yeah.

**Diego** `00:25:24`  
Because when I connect it there, it just...

**David** `00:25:27`  
So it might just be that one. But we can take a look.

**Diego** `00:25:30`  
How about... Um...

**David** `00:25:33`  
Um, and then I gotta-- I have a few questions-

**Diego** `00:25:35`  
Yeah

**David** `00:25:35`  
... from Ethan, who's not here. Let's see. Do you know what, uh, Windows version your labs run-- your, your computers run on?

**Diego** `00:25:55`  
This one?

**David** `00:25:56`  
All of them.

**Diego** `00:25:57`  
Oh, well, yeah, that's very different, honestly, because I think this one is the most updated one because it's connected to, you know, to internet, so it's basically updating by itself. But that one, I don't think, um... Let's see. Oh. [machine whirring] Does that help for Windows 11?

**David** `00:26:54`  
Yeah, Windows 11 Pro version 25H2. And then, yeah, this is actually great too. Um, and then the specs that you have here-

**Diego** `00:27:02`  
Let me see this one.

**David** `00:27:03`  
This one. So this device has eight gigs of RAM. Do you mind if I-

**Diego** `00:27:08`  
Yeah

**David** `00:27:08`  
... scroll down?

**Diego** `00:27:08`  
No, of course.

**David** `00:27:09`  
Great. So you have a graphics card, 477, eight gigs of RAM. [machine whirring] Actually, I'm gonna take a picture of this 'cause this might be useful later. [machine whirring]

**Diego** `00:27:34`  
This one should be the same. [machine whirring] Yeah, I think it's the same.

**David** `00:27:58`  
Okay. And then... Let's take that out of there. Okay, cool. Um, and then I assume the other one on the other side is the same.

**Diego** `00:28:14`  
Uh, let's check it out. I, I think... [machine whirring] Yeah, I don't know about this one. [chuckles] But I think it should be similar, yeah. [machine whirring] Here it is, what, 24?

**David** `00:29:31`  
Mm-hmm. [machine whirring] Oh, that's weird. Oh, there it is. Okay. Yeah, yeah. That works. Um, okay. And then...

**Diego** `00:29:53`  
I have a, a, another question. Um-

**David** `00:29:55`  
Sure.

**Diego** `00:29:58`  
Do you think... So as how it is right now... So, you know, I was telling you that, uh, like, to turn this on, I just, you know, run the code and then it's on. While this is reading, you know, until I stop it. So, you know, once I start this, I don't need to click, you know, record. So, you know, it's just running and it's, you know, getting all the data. So then I was wondering, like, if we integrate this device and then to turn it on, do you think it's possible, like, to just, for instance, I don't know, let's say, that there is, like, an option here, like start and turn that on?

**David** `00:30:40`  
Yeah, we can do that. No problem.

**Diego** `00:30:43`  
Because I don't know if there is a conflict, you know, between this code and the other code that is... You know, because they are different codes. So it's, I don't know if there is some conflict-

**David** `00:30:53`  
With the way we collect the data?

**Diego** `00:30:54`  
Yeah.

**David** `00:30:54`  
Yeah. So the way that it would probably work is it, it would be two different streams of data.

**Diego** `00:30:58`  
Okay.

**David** `00:30:58`  
And so we could either give you the option to let you manually start and stop either one of them, or you could stop, start and stop both of them at the same time.

**Diego** `00:31:07`  
Okay.

**David** `00:31:08`  
But it's, it's definitely possible. I don't think there would be an issue. There might be some issues in the way that we would, like, have to plot the data if, say for example, one stream was off by a couple of seconds or missing some data. But that's like, it's something we can handle. It's not a big deal.

**Diego** `00:31:20`  
Oh, yeah, I remember what I, I, I wanted to say. So also there are, another limitation with this device is that, like, sometimes my protocols last, I don't know, five minutes, other eight minutes, other fifteen minutes. And if it's a short, uh, time, like, I don't know, less than eight minutes, I think I can see, uh, like, uh, there is no delay while getting the data from this device into the file.

**David** `00:31:52`  
Okay.

**Diego** `00:31:52`  
So meaning that, for instance, if my protocol is longer than that, like even for instance, you know, I'm running it, you know, I'm, I'm checking it, and if this one enters, I don't know, to like, um... Or like I receive, I don't know, let's say like a message from someone or something pops up, like the, the code, I don't know, it struggles and then I see like an empty space for a couple of microseconds or seconds.

**David** `00:32:16`  
Yeah. .

**Diego** `00:32:17`  
So then... Yeah. So sometimes I think, uh, you know, I close and then, and then it continues, the measurement. But, so I don't know. Uh, I wonder, again, you know, if we integrate this device into this one, that also may cause some, I don't know, conflicts, uh, when we're, you know, getting the data. Because, you know, this was always on, but let's say for any reason, like, I don't know, let's say that enters in, like, I don't know, a sleep mode, and then it will, like, stop everything.

**David** `00:32:45`  
Right.

**Diego** `00:32:45`  
So kind of thing. And then it will mess up with that.

**David** `00:32:47`  
And this one, does this one handle sleep mode?

**Diego** `00:32:49`  
No, I mean, it's always on. I mean, yeah, it's always on. I, I don't think I have any issues with this one.

**David** `00:32:55`  
Okay.

**Diego** `00:32:55`  
But with my laptop, yeah, even like, you know, sometimes, like, you know, it just decreases the intensity of like the...

**David** `00:33:02`  
The screen?

**Diego** `00:33:03`  
Yeah, the screen and the... Yeah, immediately affects this device.

**David** `00:33:07`  
Okay. Yeah. -

**Diego** `00:33:07`  
So it's very sensitive, that's what I'm trying to say.

**David** `00:33:10`  
That's fair.

**Diego** `00:33:10`  
To whatever change, uh, to whatever happens to the device that is connected, this one will detect it, and then it will, you know, just have some delays or sometimes it will miss some points.

**David** `00:33:21`  
Mm-hmm. Okay. Yeah, that makes sense. We'd have to read the code to, to see if, why that happens, but we can figure it out.

**Diego** `00:33:27`  
Okay. Um, but yeah, I think that's basically, um, yeah, how this works. I mean, yeah, I'll, I'll send ASAP this code. Um, yeah, I think we can start from that, I guess.

**David** `00:33:42`  
Okay. Um, do you know if all of these computers are connected onto the same network?

**Diego** `00:33:46`  
Yeah, all of them, except this one, I think.

**David** `00:33:48`  
Except for this one.

**Diego** `00:33:49`  
Because I think this one is being... I don't know. Because last time, uh, that we wanted to, you know, to... Because there were some issues and then I reached out to IT, and then they told me, "Hey, you know, okay, log into this so we can do it, you know, from my office."

**David** `00:34:07`  
Mm-hmm.

**Diego** `00:34:07`  
And then they couldn't do it because this one was not registered in the system.

**David** `00:34:10`  
Oh, okay.

**Diego** `00:34:11`  
So, and then if you... They asked... I told them, "Well, so do we need to do that? Because, you know, then we don't wanna get in trouble." But they said, "If you do that, that may cause a lot of problems with your software."

**David** `00:34:21`  
Mm-hmm.

**Diego** `00:34:21`  
And this software is basically is old, and if we update it, it's gonna be, uh... So basically they said, "No, let's do it like that."

**David** `00:34:28`  
What software in particular? Are you talking about this application?

**Diego** `00:34:30`  
No, like the... No, this, the, the software that controls this device, this-

**David** `00:34:34`  
The mass spec one?

**Diego** `00:34:35`  
Yeah, this, yeah.

**David** `00:34:35`  
Okay. Okay. Yeah, that's actually... I'm really glad you brought that up.

**Diego** `00:34:42`  
So this is the, the, the ISO... Well, this is the whole thing that controls this, the mass spec.

**David** `00:34:48`  
Okay. Um, is there any way you can pull up the version for the software?

**Diego** `00:34:54`  
Uh-

**David** `00:34:54`  
Do you know where it would be?

**Diego** `00:34:55`  
Yeah, that's what I... I don't know.

**David** `00:35:04`  
Yeah, that's perfect. Wow.

**Diego** `00:35:12`  
But yeah, we don't, we didn't wanna touch the, uh... Because it's working, so we just don't wanna mess up with that. But yeah, this, the other, yeah, should... I don't know about the other, those, the other ones, but-

**David** `00:35:23`  
Right.

**Diego** `00:35:24`  
Yeah, but this one is, because they were, they were working, like, on something when this one was having some, like, virus or something like that, so they fixed it, yeah, from their office. But, uh, yeah, this one is connected to the system. Yeah, I don't know if the other ones.

**David** `00:35:37`  
Okay. Yeah. And so, and then I just wanna ask to make sure, it, they're not connected, uh, locally here with, like, like a box or a switch? It's over-

**Diego** `00:35:44`  
No

**David** `00:35:44`  
... the, like, the school's network?

**Diego** `00:35:45`  
Yeah, yeah, yeah.

**David** `00:35:45`  
Okay. Okay.

**Diego** `00:35:47`  
Um, and yeah, um...

**David** `00:35:53`  
And then are you guys, uh, are you guys using Wi-Fi or are you guys all connected through Ethernet?

**Diego** `00:35:58`  
Well, I think these ones are connected to Ethernet, yeah.

**David** `00:36:03`  
Through those? Oh, okay.

**Diego** `00:36:04`  
Yeah, this, this one. Yeah, this one and this one too. Yeah, both. Yeah, both are connected to Ethernet.

**David** `00:36:14`  
Okay. Cool.

**Diego** `00:36:15`  
I think the other ones are too.

**David** `00:36:17`  
As well?

**Diego** `00:36:18`  
Yeah. I think none of the devices are connected to Wi-Fi. Like, all the monitors. I mean- ... my, no, my laptop is, is with the, with the Wi-Fi, so... But yeah, all the-- I think all the monitors that we-- or laptops, not in the lab. I think most of them are .

**David** `00:36:35`  
Okay. How does your computer discover, uh, the controllers? Do you just plug them into the USB hub and then plug that into your computer and it just automatically works, or do you have to do any setup?

**Diego** `00:36:44`  
Well, no, you have to, like, you know, download, like, a bunch of packages.

**David** `00:36:49`  
So, just dependencies?

**Diego** `00:36:50`  
Yeah, I guess. But that was very straightforward and... Yeah, a bunch of these.

**David** `00:36:56`  
Okay. Yeah, yeah. Sure.

**Diego** `00:36:58`  
Yeah, then the rest was once, uh, like, the package were in the system or in the Python, then the rest were just running and, and...

**David** `00:37:05`  
Okay. Do you know if there's any documentation for this or if it's just the code?

**Diego** `00:37:09`  
No, it's just the code. I mean, that's what I got. That's the only thing that I got-

**David** `00:37:12`  
Okay

**Diego** `00:37:12`  
... from the people that developed it, so... Um...

**David** `00:37:17`  
And then do you know how much hard drive space you have left on your computers, or do you guys have more external drives available?

**Diego** `00:37:23`  
I mean, we have some externally if, you know, in case, you know, this is full- ... and then, you know, we just transfer everything. But yeah, I think that's something that... It's not a big, it's not a big problem for us, yeah.

**David** `00:37:33`  
Okay.

**Diego** `00:37:33`  
But we have some external drivers-

**David** `00:37:36`  
Awesome

**Diego** `00:37:36`  
... where we store information, uh, that are not longer needed or something like that.

**David** `00:37:43`  
Okay. Yeah. I mean, I think that's, that's everything I have. Do you have any questions? No, I don't think so. Okay. All right.

**Diego** `00:37:49`  
But, yeah, so...

**David** `00:37:51`  
Okay. Any, any other, like, bug fixes that you wanted to, like, like, look into or anything?

**Diego** `00:37:54`  
I think it's once we combine them, I think that's where we probably will spot, like, things that, "Oh, I think this is [chuckling] not how it should be," or something like that, you know what I mean?

**David** `00:38:03`  
Yeah.

**Diego** `00:38:03`  
But yeah, we want to combine these two, and then, um, I think that will facilitate a lot also, um, for any user. Um, yeah, that's pretty much it.

**David** `00:38:22`  
All right.

**Diego** `00:38:22`  
So, yeah.

**David** `00:38:24`  
All right. I think, I think we got everything we need. All right. Well, it was nice to meet you.

**Diego** `00:38:29`  
Yeah. You too.

**David** `00:38:31`  
All right. [microphone rustling]

**Diego** `00:38:32`  
Take care.

**David** `00:38:32`  
See ya.

**Diego** `00:38:33`  
See ya.
