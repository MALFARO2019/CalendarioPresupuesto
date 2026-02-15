interface GroupMembersCardProps {
    groupName: string;
    stores: string[];
}

export function GroupMembersCard({ groupName, stores }: GroupMembersCardProps) {
    if (stores.length === 0) {
        return null;
    }

    const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

    return (
        <div className="mt-6 bg-white/80 backdrop-blur rounded-xl px-5 py-3 border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500">
                <span className="font-semibold text-gray-600">📍 {titleCase(groupName)}</span>
                <span className="mx-1.5 text-gray-300">|</span>
                <span className="text-gray-400">{stores.length} locales:</span>
                <span className="ml-1">{stores.map(s => titleCase(s)).join(', ')}</span>
            </p>
        </div>
    );
}
