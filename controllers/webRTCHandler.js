module.exports = ()=>{

    const startCallController = async function (event){
        const socket = this;

        console.log(`Broadcasting start_call event to peers in room ${event.roomId} from peer ${event.senderId}`);

        socket.broadcast.to(event.roomId).emit('start_call', {
            senderId: event.senderId
        })
    };


    const webrtcOfferHandler = async function (event){
        const socket = this;

        console.log(`Sending webrtc_offer event to peers in room ${event.roomId} from peer ${event.senderId} 
        to peer ${event.receiverId}`);

        socket.broadcast.to(event.receiverId).emit('webrtc_offer', {
            sdp: event.sdp,
            senderId: event.senderId
        })
    };

    const webrtcAnswerHandler = async function (event){
        const socket = this;

        console.log(`Sending webrtc_answer event to peers in room ${event.roomId} from peer ${event.senderId} 
        to peer ${event.receiverId}`);

        socket.broadcast.to(event.receiverId).emit('webrtc_answer', {
            sdp: event.sdp,
            senderId: event.senderId
        })
    };

    const webrtcIceCandidateHandler = async function (event){
        const socket = this;
        
        console.log(`Sending webrtc_ice_candidate event to peers in room ${event.roomId} from peer 
        ${event.senderId} to peer ${event.receiverId}`);

        socket.broadcast.to(event.receiverId).emit('webrtc_ice_candidate', event);
    };

    return { startCallController, webrtcOfferHandler, webrtcAnswerHandler, webrtcIceCandidateHandler}
}